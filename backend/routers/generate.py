import asyncio
import json
import logging

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, ChatSession, ChatMessage
from dependencies import limiter, get_db
from schemas.api import GenerateRequest, RefineRequest
from services.llm import (
    get_client_for_model,
    real_generate,
    real_generate_stream,
    mock_generate,
    mock_generate_stream,
    refine_prompt_with_llm,
)

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()


async def _save_assistant_message(db: AsyncSession, body: GenerateRequest, text: str, meta: dict, provider: str):
    """Persist assistant reply and update chat title."""
    ai_msg = ChatMessage(
        session_id=    body.session_id,
        role=          "assistant",
        content=       text,
        metadata_json= json.dumps(meta, ensure_ascii=False),
    )
    db.add(ai_msg)
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == body.session_id)
    )
    sess = result.scalars().first()
    if sess:
        sess.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if sess.title == "Новий чат":
            title = body.prompt[:60].strip()
            if len(body.prompt) > 60:
                title += "…"
            sess.title = title
    await db.commit()


@limiter.limit("20/minute")
@router.post("/generate")
async def generate(request: Request, body: GenerateRequest, db: AsyncSession = Depends(get_db)):
    logger.info(
        f"[generate] model={body.model}, prompt_len={len(body.prompt)}, "
        f"history={len(body.history)}, stream={body.stream}, top_p={body.top_p}"
    )
    client, model_info = get_client_for_model(body.model)

    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {body.model}")

    # Validate / auto-create chat session
    if body.session_id:
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == body.session_id)
        )
        existing_session = result.scalars().first()
        if not existing_session:
            logger.warning(
                f"[generate] session_id={body.session_id} not found — auto-creating"
            )
            new_session = ChatSession(
                id=body.session_id,
                user_email="anonymous",
                title=body.prompt[:60].strip() + ("…" if len(body.prompt) > 60 else ""),
            )
            db.add(new_session)
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise HTTPException(
                    status_code=400,
                    detail=f"Chat session '{body.session_id}' not found and could not be created",
                )

    # Persist user message
    if body.session_id:
        user_msg = ChatMessage(session_id=body.session_id, role="user", content=body.prompt)
        db.add(user_msg)
        await db.commit()

    # STREAMING path
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
                except Exception as e:
                    logger.error(f"[stream] stream_with_save error: {type(e).__name__}: {e}")
                    yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
                finally:
                    if body.session_id and full_text:
                        async with AsyncSessionLocal() as db2:
                            await _save_assistant_message(db2, body, full_text, {}, "stream")
        else:
            async def stream_with_save():
                async for chunk in mock_generate_stream(body):
                    yield chunk

        return StreamingResponse(stream_with_save(), media_type="text/event-stream")

    # NON-STREAMING path
    result = None
    if client is not None:
        try:
            result = await asyncio.wait_for(real_generate(client, model_info, body), timeout=15.0)
        except asyncio.TimeoutError:
            logger.warning(f"[generate] {model_info['provider']} timeout — attempting mock fallback")
            try:
                result = await mock_generate(body)
            except RuntimeError:
                raise HTTPException(status_code=504, detail="LLM provider timed out")
        except Exception as e:
            logger.error(f"[generate] {model_info['provider']} FAILED: {type(e).__name__}: {e}")
            try:
                result = await mock_generate(body)
            except RuntimeError:
                raise HTTPException(status_code=502, detail="LLM provider unavailable")
    else:
        result = await mock_generate(body)

    logger.info(f"[generate] model={body.model} → provider={result.provider}")

    if body.session_id and result:
        meta = {
            "model":      result.usage.model,
            "tokens":     result.usage.total_tokens,
            "latency_ms": result.usage.latency_ms,
            "provider":   result.provider,
        }
        await _save_assistant_message(db, body, result.text, meta, result.provider)

    return result


@limiter.limit("10/minute")
@router.post("/refine")
async def refine(request: Request, body: RefineRequest) -> dict:
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt is required")
    try:
        return await refine_prompt_with_llm(prompt)
    except Exception as e:
        logger.error(f"[refine] Failed: {type(e).__name__}: {e}")

        # Fallback: Ukrainian/English template instead of 503
        is_ukrainian = any(c in prompt for c in "іїєґІЇЄҐ")
        if is_ukrainian:
            improved = (
                f"Будь ласка, надай детальну та структуровану відповідь на наступний запит: {prompt}. "
                "Розкрий тему покроково, використовуй приклади та поясни кожен крок."
            )
            questions = [
                "Який рівень деталізації вам потрібен?",
                "Для якої мети ви використовуєте цю інформацію?",
                "Чи є конкретний формат або стиль відповіді, який вам підходить?",
            ]
        else:
            improved = (
                f"Please provide a detailed and well-structured response to the following request: {prompt}. "
                "Break down the topic step by step, use examples, and explain each step clearly."
            )
            questions = [
                "What level of detail do you need?",
                "What is the purpose of this information?",
                "Is there a specific format or style you prefer?",
            ]
        return {"improved_prompt": improved, "clarifying_questions": questions}