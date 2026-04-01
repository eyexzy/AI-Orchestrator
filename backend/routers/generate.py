import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, ChatMessage, ChatSession
from dependencies import (
    RATE_LIMIT_GENERATE,
    RATE_LIMIT_GENERATE_MULTI,
    RATE_LIMIT_REFINE,
    get_current_user,
    get_db,
    get_optional_current_user,
    limiter,
)
from schemas.api import GenerateRequest, MultiGenerateRequest, RefineRequest
from services.llm import (
    get_client_for_model,
    get_mock_mode,
    mock_generate,
    real_generate,
    real_generate_stream,
    refine_prompt_with_llm,
)

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()


def _message_to_response(message: ChatMessage) -> dict:
    try:
        metadata = json.loads(message.metadata_json or "{}")
        if not isinstance(metadata, dict):
            metadata = {}
    except (TypeError, json.JSONDecodeError):
        metadata = {}

    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "metadata": metadata,
    }


def _build_chat_title(prompt: str) -> str:
    title = prompt[:60].strip()
    if len(prompt) > 60:
        title += "..."
    return title or "New Chat"


async def _ensure_session(
    db: AsyncSession,
    session_id: str,
    prompt: str,
    user_email: str,
    enforce_owner: bool = False,
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalars().first()
    if session:
        if enforce_owner and session.user_email != user_email:
            raise HTTPException(status_code=404, detail="Chat not found")
        return session

    session = ChatSession(
        id=session_id,
        user_email=user_email,
        title=_build_chat_title(prompt),
    )
    db.add(session)
    try:
        await db.commit()
        await db.refresh(session)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Chat session '{session_id}' not found and could not be created",
        )

    return session


async def _save_user_message(db: AsyncSession, session_id: str, prompt: str) -> dict:
    user_msg = ChatMessage(session_id=session_id, role="user", content=prompt)
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)
    return _message_to_response(user_msg)


async def _save_assistant_message(
    db: AsyncSession,
    body: GenerateRequest,
    text: str,
    meta: dict,
) -> dict:
    if not body.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for persistence")

    ai_msg = ChatMessage(
        session_id=body.session_id,
        role="assistant",
        content=text,
        metadata_json=json.dumps(meta, ensure_ascii=False),
    )
    db.add(ai_msg)

    result = await db.execute(
        select(ChatSession).where(ChatSession.id == body.session_id)
    )
    session = result.scalars().first()
    if session:
        session.updated_at = datetime.now(timezone.utc)
        if session.title in {"New Chat", "Новий чат"}:
            session.title = _build_chat_title(body.prompt)

    await db.commit()
    await db.refresh(ai_msg)
    return _message_to_response(ai_msg)


async def _generate_once(body: GenerateRequest):
    client, model_info = get_client_for_model(body.model)
    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {body.model}")

    if get_mock_mode() == "always":
        result = await mock_generate(body, reason="no_provider")
        logger.info(
            "[generate] completed",
            extra={"model": body.model, "provider": result.provider},
        )
        return result

    if client is not None:
        try:
            result = await asyncio.wait_for(real_generate(client, model_info, body), timeout=15.0)
        except asyncio.TimeoutError:
            logger.warning(
                "[generate] provider_timeout",
                extra={"provider": model_info["provider"], "model": body.model},
            )
            try:
                result = await mock_generate(body, reason="provider_failure")
            except RuntimeError:
                raise HTTPException(status_code=504, detail="LLM provider timed out")
        except Exception as exc:
            logger.error(
                "[generate] provider_failure",
                extra={
                    "provider": model_info["provider"],
                    "model": body.model,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            try:
                result = await mock_generate(body, reason="provider_failure")
            except RuntimeError:
                raise HTTPException(status_code=502, detail="LLM provider unavailable")
    else:
        try:
            result = await mock_generate(body, reason="no_provider")
        except RuntimeError:
            raise HTTPException(
                status_code=503,
                detail="No configured provider for this model and mock mode is disabled",
            )

    logger.info(
        "[generate] completed",
        extra={"model": body.model, "provider": result.provider},
    )
    return result


@limiter.limit(RATE_LIMIT_GENERATE)
@router.post("/generate")
async def generate(
    request: Request,
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str | None = Depends(get_optional_current_user),
):
    logger.info(
        "[generate] requested",
        extra={
            "model": body.model,
            "prompt_len": len(body.prompt),
            "history_size": len(body.history),
            "stream": body.stream,
            "top_p": body.top_p,
            "session_id": body.session_id,
        },
    )
    client, model_info = get_client_for_model(body.model)
    if get_mock_mode() == "always":
        client = None

    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {body.model}")

    if body.session_id:
        if not user_email:
            raise HTTPException(
                status_code=401,
                detail="Authentication required for persisted chat generation",
            )
        await _ensure_session(
            db=db,
            session_id=body.session_id,
            prompt=body.prompt,
            user_email=user_email,
            enforce_owner=True,
        )
        await _save_user_message(db, body.session_id, body.prompt)

    if body.stream:
        if client is not None:

            async def stream_with_save():
                full_text = ""
                try:
                    async for chunk in real_generate_stream(client, model_info, body):
                        yield chunk
                        if chunk.startswith("data: "):
                            try:
                                data = json.loads(chunk[6:])
                                if data.get("done") and data.get("full_text"):
                                    full_text = data["full_text"]
                            except Exception:
                                pass
                except Exception as exc:
                    logger.error(
                        f"[stream] stream_with_save error: {type(exc).__name__}: {exc}"
                    )
                    yield f"data: {json.dumps({'error': str(exc), 'done': True})}\n\n"
                finally:
                    if body.session_id and full_text:
                        try:
                            async with AsyncSessionLocal() as db2:
                                await _save_assistant_message(db2, body, full_text, {})
                        except Exception as exc:
                            logger.warning(
                                "[stream] assistant_message_persist_failed",
                                extra={"error": f"{type(exc).__name__}: {exc}"},
                            )

        else:
            try:
                mock_result = await mock_generate(body, reason="no_provider")
            except RuntimeError:
                raise HTTPException(
                    status_code=503,
                    detail="No configured provider for this model and mock mode is disabled",
                )

            async def stream_with_save():
                words = mock_result.text.split(" ")
                for word in words:
                    payload = json.dumps({"text": word + " ", "done": False}, ensure_ascii=False)
                    yield f"data: {payload}\n\n"
                    await asyncio.sleep(0.03)
                done_payload = json.dumps(
                    {"text": "", "done": True, "full_text": mock_result.text},
                    ensure_ascii=False,
                )
                yield f"data: {done_payload}\n\n"

        return StreamingResponse(stream_with_save(), media_type="text/event-stream")

    result = await _generate_once(body)

    if body.session_id:
        meta = {
            "model": result.usage.model,
            "tokens": result.usage.total_tokens,
            "latency_ms": result.usage.latency_ms,
            "provider": result.provider,
        }
        await _save_assistant_message(db, body, result.text, meta)

    return result


@limiter.limit(RATE_LIMIT_GENERATE_MULTI)
@router.post("/generate/multi")
async def generate_multi(
    request: Request,
    body: MultiGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    logger.info(
        f"[generate/multi] mode={body.mode}, model={body.model}, prompt_len={len(body.prompt)}, "
        f"history={len(body.history)}, session_id={body.session_id}"
    )

    await _ensure_session(
        db=db,
        session_id=body.session_id,
        prompt=body.prompt,
        user_email=user_email,
        enforce_owner=True,
    )
    await _save_user_message(db, body.session_id, body.prompt)

    base_payload = body.model_dump(
        exclude={
            "mode",
            "model_label",
            "compare_model",
            "compare_model_label",
            "run_count",
        }
    )
    primary_request = GenerateRequest(**base_payload)

    if body.mode == "compare":
        if not body.compare_model or body.compare_model == body.model:
            raise HTTPException(status_code=422, detail="compare_model is required")

        secondary_request = GenerateRequest(
            **{
                **base_payload,
                "model": body.compare_model,
            }
        )
        primary_result, secondary_result = await asyncio.gather(
            _generate_once(primary_request),
            _generate_once(secondary_request),
        )
        metadata = {
            "isCompare": True,
            "comparison": {
                "modelA": {
                    "text": primary_result.text,
                    "model": body.model,
                    "modelLabel": body.model_label or body.model,
                    "latency_ms": primary_result.usage.latency_ms,
                    "total_tokens": primary_result.usage.total_tokens,
                },
                "modelB": {
                    "text": secondary_result.text,
                    "model": body.compare_model,
                    "modelLabel": body.compare_model_label or body.compare_model,
                    "latency_ms": secondary_result.usage.latency_ms,
                    "total_tokens": secondary_result.usage.total_tokens,
                },
            },
        }
        assistant_text = primary_result.text
    else:
        results = await asyncio.gather(
            *[_generate_once(primary_request) for _ in range(body.run_count)]
        )
        metadata = {
            "isSelfConsistency": True,
            "selfConsistency": {
                "model": body.model,
                "modelLabel": body.model_label or body.model,
                "runs": [
                    {
                        "text": item.text,
                        "latency_ms": item.usage.latency_ms,
                        "total_tokens": item.usage.total_tokens,
                    }
                    for item in results
                ],
            },
        }
        assistant_text = results[0].text if results else ""

    assistant_message = await _save_assistant_message(
        db=db,
        body=GenerateRequest(**base_payload),
        text=assistant_text,
        meta=metadata,
    )
    return {"assistant_message": assistant_message}


@limiter.limit(RATE_LIMIT_REFINE)
@router.post("/refine")
async def refine(request: Request, body: RefineRequest) -> dict:
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt is required")

    try:
        return await refine_prompt_with_llm(
            prompt,
            language=body.language,
            level=body.level,
            clarification_answers=body.clarification_answers,
        )
    except Exception as exc:
        logger.error(f"[refine] Failed: {type(exc).__name__}: {exc}")
        if isinstance(exc, asyncio.TimeoutError):
            raise HTTPException(status_code=504, detail="tutor_review_timeout") from exc
        if isinstance(exc, (ValueError, json.JSONDecodeError)):
            raise HTTPException(status_code=502, detail="invalid_tutor_review") from exc
        if isinstance(exc, RuntimeError) and str(exc) == "no_client":
            raise HTTPException(status_code=503, detail="tutor_review_unavailable") from exc
        raise HTTPException(status_code=502, detail="tutor_review_unavailable") from exc
