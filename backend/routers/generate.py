import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, ChatMessage, ChatSession, DailyUsage, Project, ProjectSource, UploadedFile
from dependencies import (
    RATE_LIMIT_GENERATE,
    RATE_LIMIT_GENERATE_MULTI,
    RATE_LIMIT_REFINE,
    get_current_user,
    get_db,
    get_optional_current_user,
    limiter,
)
from schemas.api import GenerateRequest, HistoryMessage, MultiGenerateRequest, RefineRequest
from services.context_budget import (
    estimate_tokens,
    fit_blocks_by_token_budget,
    select_recent_messages_by_token_budget,
)
from services.files import build_attachment_context
from services.llm import (
    _merge_continuation_text,
    estimate_cost_usd,
    fallback_prompt_suggestions,
    get_client_for_model,
    real_generate,
    real_generate_stream,
    refine_prompt_with_llm,
    generate_prompt_suggestions_with_llm,
)

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()


class PromptSuggestionsRequest(BaseModel):
    user_email: str | None = None
    level: int | None = Field(default=None, ge=1, le=3)
    language: str | None = None
    history: list[HistoryMessage] = Field(default_factory=list)


PROMPT_SUGGESTION_DB_MESSAGE_LIMIT = 24


async def _build_prompt_suggestion_history(
    db: AsyncSession,
    body: PromptSuggestionsRequest,
) -> list[HistoryMessage]:
    merged: list[HistoryMessage] = []
    seen: set[tuple[str, str]] = set()

    for item in body.history:
        content = item.content.strip()
        if not content:
            continue
        key = (item.role, content)
        if key in seen:
            continue
        seen.add(key)
        merged.append(HistoryMessage(role=item.role, content=content[:4000]))

    user_email = (body.user_email or "").strip().lower()
    if not user_email or user_email == "anonymous":
        return merged

    result = await db.execute(
        select(ChatMessage.role, ChatMessage.content)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatSession.user_email == user_email,
            ChatMessage.content != "",
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(PROMPT_SUGGESTION_DB_MESSAGE_LIMIT)
    )
    rows = list(reversed(result.all()))
    for role, content in rows:
        text = (content or "").strip()
        if not text:
            continue
        key = (role, text)
        if key in seen:
            continue
        seen.add(key)
        merged.append(HistoryMessage(role=role, content=text[:4000]))

    return merged[-PROMPT_SUGGESTION_DB_MESSAGE_LIMIT:]

# Token-based limits (configurable via env)
DAILY_TOKEN_LIMIT  = int(os.getenv("DAILY_TOKEN_LIMIT",  "100000"))   # 100K tokens/day
WEEKLY_TOKEN_LIMIT = int(os.getenv("WEEKLY_TOKEN_LIMIT", "500000"))   # 500K tokens/week
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}
PROJECT_FILE_CONTEXT_TOKEN_BUDGET = max(0, int(os.getenv("LLM_PROJECT_FILE_CONTEXT_TOKEN_BUDGET", "12000")))
PROJECT_CHAT_CONTEXT_TOKEN_BUDGET = max(0, int(os.getenv("LLM_PROJECT_CHAT_CONTEXT_TOKEN_BUDGET", "3000")))
PROJECT_CHAT_CONTEXT_MAX_CHATS = max(0, int(os.getenv("LLM_PROJECT_CHAT_CONTEXT_MAX_CHATS", "5")))
PROJECT_CHAT_CONTEXT_MESSAGES_PER_CHAT = max(0, int(os.getenv("LLM_PROJECT_CHAT_CONTEXT_MESSAGES_PER_CHAT", "6")))
FORK_CONTEXT_TOKEN_BUDGET = max(0, int(os.getenv("LLM_FORK_CONTEXT_TOKEN_BUDGET", "1800")))
FORK_CONTEXT_MAX_ANCESTORS = max(1, int(os.getenv("LLM_FORK_CONTEXT_MAX_ANCESTORS", "3")))
FORK_CONTEXT_MESSAGES_PER_ANCESTOR = max(1, int(os.getenv("LLM_FORK_CONTEXT_MESSAGES_PER_ANCESTOR", "8")))


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def increment_daily_usage(
    db: AsyncSession,
    user_email: str,
    tokens: int,
) -> tuple[int, int]:
    """Increment token counter AFTER generation. Returns (tokens_used_today, daily_limit).
    Raises 429 if the limit was already exceeded before this request."""
    if user_email.lower() in ADMIN_EMAILS:
        return (0, DAILY_TOKEN_LIMIT)

    today = _today_utc()

    stmt = pg_insert(DailyUsage).values(
        user_email=user_email,
        date=today,
        request_count=1,
        token_count=tokens,
    ).on_conflict_do_update(
        index_elements=["user_email", "date"],
        set_={
            "request_count": DailyUsage.request_count + 1,
            "token_count": DailyUsage.token_count + tokens,
        },
    ).returning(DailyUsage.token_count, DailyUsage.request_count)

    result = await db.execute(stmt)
    await db.commit()
    row = result.one()
    used_tokens = row[0]

    return (used_tokens, DAILY_TOKEN_LIMIT)


async def check_daily_token_limit(db: AsyncSession, user_email: str) -> None:
    """Pre-flight check: raise 429 if today's token budget is already exhausted."""
    if user_email.lower() in ADMIN_EMAILS:
        return

    today = _today_utc()
    result = await db.execute(
        select(DailyUsage.token_count).where(
            DailyUsage.user_email == user_email,
            DailyUsage.date == today,
        )
    )
    used = result.scalar_one_or_none() or 0
    if used >= DAILY_TOKEN_LIMIT:
        raise HTTPException(status_code=429, detail="daily_limit_exceeded")


async def get_daily_usage(db: AsyncSession, user_email: str) -> tuple[int, int]:
    """Get token usage today. Returns (tokens_used, daily_limit)."""
    today = _today_utc()
    result = await db.execute(
        select(DailyUsage.token_count).where(
            DailyUsage.user_email == user_email,
            DailyUsage.date == today,
        )
    )
    used = result.scalar_one_or_none() or 0
    return (int(used), DAILY_TOKEN_LIMIT)


async def get_weekly_usage(db: AsyncSession, user_email: str) -> tuple[int, int]:
    """Get token usage this UTC week (Mon–Sun). Returns (tokens_used, weekly_limit)."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    result = await db.execute(
        select(func.sum(DailyUsage.token_count)).where(
            DailyUsage.user_email == user_email,
            DailyUsage.date >= week_start,
        )
    )
    used = result.scalar_one_or_none() or 0
    return (int(used), WEEKLY_TOKEN_LIMIT)


async def get_usage_history(
    db: AsyncSession,
    user_email: str,
    days: int = 30,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """Return paginated per-request history from assistant messages."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    base_where = [
        ChatSession.user_email == user_email,
        ChatMessage.role == "assistant",
        ChatMessage.created_at >= since,
    ]

    count_result = await db.execute(
        select(func.count())
        .select_from(ChatMessage)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(*base_where)
    )
    total = count_result.scalar_one() or 0

    rows_result = await db.execute(
        select(
            ChatMessage.id,
            ChatMessage.session_id,
            ChatMessage.created_at,
            ChatMessage.metadata_json,
            ChatSession.title,
        )
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(*base_where)
        .order_by(ChatMessage.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = rows_result.all()

    items = []
    for row in rows:
        try:
            meta = json.loads(row.metadata_json or "{}")
        except Exception:
            meta = {}
        model_label = meta.get("model") or meta.get("model_id") or "—"
        tokens = meta.get("tokens") or meta.get("estimated_tokens") or 0
        cost_usd = 0.0
        gs = meta.get("generation_summary") or {}
        if isinstance(gs, dict):
            tokens = gs.get("total_tokens") or gs.get("completion_tokens") or gs.get("estimated_tokens") or tokens
            model_label = gs.get("model_label") or model_label
            cost_usd = float(gs.get("cost_usd") or 0.0)
        if cost_usd == 0.0:
            raw_usage = meta.get("usage") or {}
            if isinstance(raw_usage, dict) and raw_usage.get("cost_usd"):
                cost_usd = float(raw_usage["cost_usd"])
        # Determine kind
        if meta.get("isCompare"):
            kind = "Compare"
        elif meta.get("isSelfConsistency"):
            kind = "Self-consistency"
        else:
            kind = "Chat"
        items.append({
            "id": row.id,
            "chat_id": row.session_id,
            "chat_title": row.title or "Chat",
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "model": model_label,
            "tokens": int(tokens),
            "cost_usd": cost_usd,
            "kind": kind,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "items": items,
    }


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


async def _build_project_context_budgeted(
    db: AsyncSession,
    session: ChatSession,
) -> tuple[str | None, int]:
    """Build project context with token budgets and without mutating stored file text."""
    if not session.project_id:
        return None, 0

    project_result = await db.execute(
        select(Project).where(Project.id == session.project_id)
    )
    project = project_result.scalars().first()
    if not project:
        return None, 0

    parts: list[str] = []

    identity_lines: list[str] = []
    if project.name and project.name.strip():
        identity_lines.append(f"Project name: {project.name.strip()}")
    if project.description and project.description.strip():
        identity_lines.append(f"Project description: {project.description.strip()}")
    if identity_lines:
        parts.append("[Project]\n" + "\n".join(identity_lines))

    sources_result = await db.execute(
        select(ProjectSource, UploadedFile)
        .join(UploadedFile, ProjectSource.file_id == UploadedFile.id)
        .where(ProjectSource.project_id == project.id)
        .order_by(ProjectSource.created_at.asc())
    )
    source_blocks = [
        (src.title or f.filename, (f.extracted_text or "").strip())
        for src, f in sources_result.all()
        if (f.extracted_text or "").strip()
    ]
    source_parts, _used_tokens, omitted_sources = fit_blocks_by_token_budget(
        source_blocks,
        max_tokens=PROJECT_FILE_CONTEXT_TOKEN_BUDGET,
        omitted_label="project file",
    )
    if source_parts:
        source_context = "[Project Knowledge Sources]\n\n" + "\n\n".join(source_parts)
        if omitted_sources:
            source_context += (
                f"\n\n[{omitted_sources} additional project source(s) omitted from this request "
                "to fit the context budget.]"
            )
        parts.append(source_context)

    chat_summaries: list[str] = []
    chat_context_tokens = 0
    if PROJECT_CHAT_CONTEXT_MAX_CHATS > 0 and PROJECT_CHAT_CONTEXT_TOKEN_BUDGET > 0:
        sibling_chats_result = await db.execute(
            select(ChatSession.id, ChatSession.title)
            .where(
                ChatSession.project_id == project.id,
                ChatSession.id != session.id,
            )
            .order_by(ChatSession.updated_at.desc())
            .limit(PROJECT_CHAT_CONTEXT_MAX_CHATS)
        )

        for chat_id, chat_title in sibling_chats_result.all():
            remaining_tokens = PROJECT_CHAT_CONTEXT_TOKEN_BUDGET - chat_context_tokens
            if remaining_tokens <= 0:
                break
            msgs_result = await db.execute(
                select(ChatMessage.role, ChatMessage.content)
                .where(ChatMessage.session_id == chat_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(max(PROJECT_CHAT_CONTEXT_MESSAGES_PER_CHAT * 3, PROJECT_CHAT_CONTEXT_MESSAGES_PER_CHAT))
            )
            recent = select_recent_messages_by_token_budget(
                [{"role": role, "content": content} for role, content in reversed(msgs_result.all())],
                max_tokens=remaining_tokens,
                max_messages=PROJECT_CHAT_CONTEXT_MESSAGES_PER_CHAT,
            )
            if not recent:
                continue

            msgs_text = "\n".join(f"  {item.role}: {item.content}" for item in recent)
            block = f"- \"{chat_title}\":\n{msgs_text}"
            block_tokens = estimate_tokens(block) + 2
            if block_tokens > remaining_tokens:
                continue
            chat_summaries.append(block)
            chat_context_tokens += block_tokens

    if chat_summaries:
        parts.append("[Other chats in this project]\n" + "\n".join(chat_summaries))

    return ("\n\n".join(parts) if parts else None, len(chat_summaries))


async def _build_fork_context_budgeted(
    db: AsyncSession,
    session: ChatSession,
) -> str | None:
    if not session.parent_chat_id or not session.forked_from_message_id or FORK_CONTEXT_TOKEN_BUDGET <= 0:
        return None

    parts: list[str] = []
    current_session = session
    used_tokens = 0

    for depth in range(FORK_CONTEXT_MAX_ANCESTORS):
        parent_id = current_session.parent_chat_id
        fork_message_id = current_session.forked_from_message_id
        if not parent_id or not fork_message_id:
            break

        parent_result = await db.execute(
            select(ChatSession).where(ChatSession.id == parent_id)
        )
        parent_session = parent_result.scalars().first()
        if not parent_session:
            break

        remaining_tokens = FORK_CONTEXT_TOKEN_BUDGET - used_tokens
        if remaining_tokens <= 0:
            break

        msgs_result = await db.execute(
            select(ChatMessage.role, ChatMessage.content)
            .where(
                ChatMessage.session_id == parent_session.id,
                ChatMessage.id <= fork_message_id,
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(max(FORK_CONTEXT_MESSAGES_PER_ANCESTOR * 3, FORK_CONTEXT_MESSAGES_PER_ANCESTOR))
        )
        recent_messages = select_recent_messages_by_token_budget(
            [{"role": role, "content": content} for role, content in reversed(msgs_result.all())],
            max_tokens=max(64, remaining_tokens - 16),
            max_messages=FORK_CONTEXT_MESSAGES_PER_ANCESTOR,
        )

        lineage_label = (
            f'Fork source {depth + 1}: "{parent_session.title}"'
            if parent_session.title
            else f"Fork source {depth + 1}"
        )
        if recent_messages:
            transcript = "\n".join(f"  {item.role}: {item.content}" for item in recent_messages)
            block = f"{lineage_label}\n{transcript}"
        else:
            block = f"{lineage_label}\n  [No retained messages available from the fork point.]"

        block_tokens = estimate_tokens(block) + 4
        if block_tokens > remaining_tokens:
            break

        parts.append(block)
        used_tokens += block_tokens
        current_session = parent_session

    if not parts:
        return None

    return (
        "[Fork lineage context]\n"
        "This chat was branched from an earlier conversation. Keep continuity with that branch history.\n\n"
        + "\n\n".join(parts)
    )


def _sse_payload(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_generation_trace(
    *,
    duration_ms: int | None,
    first_token_ms: int | None,
    history_count: int,
    project_chat_count: int,
    project_context_used: bool,
    stream_chunks: int,
    stream_chars: int,
    estimated_tokens: int,
    is_streaming: bool,
) -> list[dict]:
    trace: list[dict] = []

    if is_streaming and first_token_ms is None:
        trace.append({
            "id": "thought",
            "kind": "thought",
            "state": "active",
        })
    else:
        trace.append({
            "id": "thought",
            "kind": "thought",
            "state": "completed",
            "duration_ms": max(0, first_token_ms if first_token_ms is not None else (duration_ms or 0)),
        })

    context_items = history_count + project_chat_count
    if context_items > 0 or project_context_used:
        trace.append({
            "id": "context",
            "kind": "context",
            "state": "completed" if first_token_ms is not None or not is_streaming else "active",
            "count": context_items,
            "history_count": history_count,
            "project_chat_count": project_chat_count,
            "project_context_used": project_context_used,
        })

    if is_streaming:
        trace.append({
            "id": "generating",
            "kind": "generating",
            "state": "active",
            "stream_chunks": stream_chunks,
            "stream_chars": stream_chars,
            "estimated_tokens": estimated_tokens,
        })

    return trace


async def _inject_attachment_context(
    db: AsyncSession,
    body: GenerateRequest,
    user_email: str,
) -> None:
    """Fetch extracted text for attachment_ids and prepend to system_message."""
    if not body.attachment_ids:
        return

    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id.in_(body.attachment_ids),
            UploadedFile.user_email == user_email,
        )
    )
    files = result.scalars().all()
    pairs = [(f.filename, f.extracted_text or "") for f in files]
    context_block = build_attachment_context(pairs)
    if not context_block:
        return

    if body.system_message and body.system_message.strip():
        body.system_message = f"{context_block}\n\n{body.system_message}"
    else:
        body.system_message = context_block


async def _ensure_session(
    db: AsyncSession,
    session_id: str,
    prompt: str,
    user_email: str,
    enforce_owner: bool = False,
    project_id: str | None = None,
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalars().first()
    if session:
        if enforce_owner and session.user_email != user_email:
            raise HTTPException(status_code=404, detail="Chat not found")
        # If session exists but has no project_id yet, set it now
        if project_id and not session.project_id:
            session.project_id = project_id
            await db.commit()
            await db.refresh(session)
        return session

    session = ChatSession(
        id=session_id,
        user_email=user_email,
        title=_build_chat_title(prompt),
        project_id=project_id,
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

    ai_msg: ChatMessage | None = None
    if body.continuation_message_id is not None:
        result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.id == body.continuation_message_id,
                ChatMessage.session_id == body.session_id,
                ChatMessage.role == "assistant",
            )
        )
        ai_msg = result.scalars().first()

    if ai_msg is None:
        ai_msg = ChatMessage(
            session_id=body.session_id,
            role="assistant",
            content=text,
            metadata_json=json.dumps(meta, ensure_ascii=False),
        )
        db.add(ai_msg)
    else:
        ai_msg.content = _merge_continuation_text(ai_msg.content or "", text)
        ai_msg.metadata_json = json.dumps(meta, ensure_ascii=False)

    result = await db.execute(
        select(ChatSession).where(ChatSession.id == body.session_id)
    )
    session = result.scalars().first()
    if session:
        session.updated_at = datetime.now(timezone.utc)
        if not body.continuation_text.strip() and session.title in {"New Chat", "Новий чат"}:
            session.title = _build_chat_title(body.prompt)

    await db.commit()
    await db.refresh(ai_msg)
    return _message_to_response(ai_msg)


async def _generate_once(body: GenerateRequest):
    client, model_info = get_client_for_model(body.model)
    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {body.model}")
    if client is None:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    try:
        result = await real_generate(client, model_info, body)
    except asyncio.TimeoutError:
        logger.warning(
            "[generate] provider_timeout",
            extra={"provider": model_info["provider"], "model": body.model},
        )
        raise HTTPException(status_code=504, detail="LLM provider timed out")
    except RuntimeError as exc:
        if str(exc) == "llm_capacity_timeout":
            logger.warning(
                "[generate] capacity_timeout",
                extra={"provider": model_info["provider"], "model": body.model},
            )
            raise HTTPException(status_code=503, detail="LLM capacity temporarily exhausted") from exc
        logger.error(
            "[generate] provider_failure",
            extra={
                "provider": model_info["provider"],
                "model": body.model,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
        raise HTTPException(status_code=502, detail="LLM provider unavailable") from exc
    except Exception as exc:
        logger.error(
            "[generate] provider_failure",
            extra={
                "provider": model_info["provider"],
                "model": body.model,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
        raise HTTPException(status_code=502, detail="LLM provider unavailable")

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
    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {body.model}")
    if client is None:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    # Pre-flight token limit check (authenticated users only)
    if user_email:
        await check_daily_token_limit(db, user_email)

    project_context_used = False

    if body.session_id:
        if not user_email:
            raise HTTPException(
                status_code=401,
                detail="Authentication required for persisted chat generation",
            )
        session = await _ensure_session(
            db=db,
            session_id=body.session_id,
            prompt=body.prompt,
            user_email=user_email,
            enforce_owner=True,
            project_id=body.project_id,
        )
        if not body.continuation_text.strip():
            await _save_user_message(db, body.session_id, body.prompt)

        # Inject attachment context (extracted file text) before project context
        await _inject_attachment_context(db, body, user_email)

        fork_context = await _build_fork_context_budgeted(db, session)
        if fork_context:
            if body.system_message and body.system_message.strip():
                body.system_message = f"{fork_context}\n\n{body.system_message}"
            else:
                body.system_message = fork_context

        # Inject project instructions + cross-chat context
        project_context, project_chat_count = await _build_project_context_budgeted(db, session)
        if project_context:
            project_context_used = True
            if body.system_message and body.system_message.strip():
                body.system_message = f"{project_context}\n\n{body.system_message}"
            else:
                body.system_message = project_context
    else:
        project_chat_count = 0

    history_count = len(body.history)

    if body.stream:
        async def stream_with_save():
            started_at_ms = int(time.time() * 1000)
            full_text = ""
            first_token_ms: int | None = None
            stream_chunks = 0
            stream_chars = 0
            estimated_tokens = 0
            stream_failed = False
            stream_finish_reason: str | None = None
            stream_truncated = False
            continued_passes = 0
            exact_prompt_tokens: int | None = None
            exact_completion_tokens: int | None = None
            exact_total_tokens: int | None = None
            exact_cost_usd: float | None = None
            provider_generation_id: str | None = None
            generation_trace = _build_generation_trace(
                duration_ms=None,
                first_token_ms=None,
                history_count=history_count,
                project_chat_count=project_chat_count,
                project_context_used=project_context_used,
                stream_chunks=stream_chunks,
                stream_chars=stream_chars,
                estimated_tokens=estimated_tokens,
                is_streaming=True,
            )
            generation_summary = {
                "started_at_ms": started_at_ms,
                "history_count": history_count,
                "project_chat_count": project_chat_count,
                "project_context_used": project_context_used,
                "stream_chunks": stream_chunks,
                "stream_chars": stream_chars,
                "estimated_tokens": estimated_tokens,
                "model_label": model_info["label"],
                "model_id": body.model,
                "provider": model_info["provider"],
                "finish_reason": None,
                "continued_passes": 0,
                "truncated": False,
                "can_continue": False,
            }

            try:
                yield _sse_payload({
                    "type": "generation_state",
                    "generation_trace": generation_trace,
                    "generation_summary": generation_summary,
                })

                if client is not None:
                    async for chunk in real_generate_stream(client, model_info, body):
                        if not chunk.startswith("data: "):
                            continue

                        try:
                            data = json.loads(chunk[6:])
                        except Exception:
                            continue

                        if data.get("done"):
                            if data.get("full_text"):
                                full_text = data["full_text"]
                            if isinstance(data.get("finish_reason"), str):
                                stream_finish_reason = data["finish_reason"]
                            if isinstance(data.get("continued_passes"), int):
                                continued_passes = data["continued_passes"]
                            if isinstance(data.get("truncated"), bool):
                                stream_truncated = data["truncated"]
                            if isinstance(data.get("provider_generation_id"), str):
                                provider_generation_id = data["provider_generation_id"]
                            if isinstance(data.get("usage"), dict):
                                usage_data = data["usage"]
                                if isinstance(usage_data.get("prompt_tokens"), int):
                                    exact_prompt_tokens = usage_data["prompt_tokens"]
                                if isinstance(usage_data.get("completion_tokens"), int):
                                    exact_completion_tokens = usage_data["completion_tokens"]
                                if isinstance(usage_data.get("total_tokens"), int):
                                    exact_total_tokens = usage_data["total_tokens"]
                                if isinstance(usage_data.get("cost_usd"), (int, float)):
                                    exact_cost_usd = float(usage_data["cost_usd"])
                                if exact_total_tokens is None and (
                                    exact_prompt_tokens is not None or exact_completion_tokens is not None
                                ):
                                    exact_total_tokens = (exact_prompt_tokens or 0) + (exact_completion_tokens or 0)
                            continue

                        delta = data.get("text")
                        if not isinstance(delta, str) or not delta:
                            continue

                        if first_token_ms is None:
                            first_token_ms = max(0, int(time.time() * 1000) - started_at_ms)
                            generation_summary["first_token_ms"] = first_token_ms
                            generation_trace = _build_generation_trace(
                                duration_ms=None,
                                first_token_ms=first_token_ms,
                                history_count=history_count,
                                project_chat_count=project_chat_count,
                                project_context_used=project_context_used,
                                stream_chunks=stream_chunks,
                                stream_chars=stream_chars,
                                estimated_tokens=estimated_tokens,
                                is_streaming=True,
                            )
                            yield _sse_payload({
                                "type": "generation_state",
                                "generation_trace": generation_trace,
                                "generation_summary": generation_summary,
                            })

                        full_text += delta
                        stream_chunks += 1
                        stream_chars = len(full_text)
                        estimated_tokens = max(1, stream_chars // 4) if stream_chars > 0 else 0

                        yield _sse_payload({"type": "text", "text": delta, "done": False})
                    if not full_text.strip():
                        raise RuntimeError("LLM returned an empty streaming response")
            except Exception as exc:
                logger.error(
                    "[stream] stream_with_save error",
                    extra={"error": f"{type(exc).__name__}: {exc}"},
                )
                stream_failed = True
                # Extract HTTP status code if available
                error_code: str | None = None
                exc_msg = str(exc)
                import re as _re
                m = _re.search(r"provider_http_(\d+)", exc_msg)
                if m:
                    error_code = m.group(1)
                elif "402" in exc_msg:
                    error_code = "402"
                elif "429" in exc_msg:
                    error_code = "429"
                elif "503" in exc_msg or "502" in exc_msg:
                    error_code = "503"
                elif "llm_capacity_timeout" in exc_msg:
                    error_code = "503"
                yield _sse_payload({
                    "error": "provider_error",
                    "error_code": error_code,
                    "done": True,
                })
            finally:
                if stream_failed:
                    return

                duration_ms = max(0, int(time.time() * 1000) - started_at_ms)
                prompt_est = max(1, stream_chars // 8)
                cost_usd = exact_cost_usd if exact_cost_usd is not None else estimate_cost_usd(
                    model_info.get("api_name", body.model),
                    prompt_est,
                    estimated_tokens,
                )
                generation_summary.update({
                    "duration_ms": duration_ms,
                    "completed_at_ms": started_at_ms + duration_ms,
                    "first_token_ms": first_token_ms if first_token_ms is not None else duration_ms,
                    "stream_chunks": stream_chunks,
                    "stream_chars": stream_chars,
                    "estimated_tokens": estimated_tokens,
                    "finish_reason": stream_finish_reason,
                    "continued_passes": continued_passes,
                    "truncated": stream_truncated,
                    "can_continue": stream_truncated,
                    "cost_usd": cost_usd,
                    "prompt_tokens": exact_prompt_tokens,
                    "completion_tokens": exact_completion_tokens,
                    "total_tokens": exact_total_tokens,
                    "provider_generation_id": provider_generation_id,
                })
                generation_trace = _build_generation_trace(
                    duration_ms=duration_ms,
                    first_token_ms=first_token_ms,
                    history_count=history_count,
                    project_chat_count=project_chat_count,
                    project_context_used=project_context_used,
                    stream_chunks=stream_chunks,
                    stream_chars=stream_chars,
                    estimated_tokens=estimated_tokens,
                    is_streaming=False,
                )

                yield _sse_payload({
                    "type": "done",
                    "done": True,
                    "full_text": full_text,
                    "generation_trace": generation_trace,
                    "generation_summary": generation_summary,
                })

                # Increment token usage after successful generation
                accounted_tokens = exact_total_tokens if isinstance(exact_total_tokens, int) and exact_total_tokens > 0 else estimated_tokens
                if user_email and accounted_tokens > 0:
                    try:
                        async with AsyncSessionLocal() as db_tok:
                            await increment_daily_usage(db_tok, user_email, accounted_tokens)
                    except Exception:
                        pass

                if body.session_id and full_text:
                    try:
                        async with AsyncSessionLocal() as db2:
                            await _save_assistant_message(
                                db2,
                                body,
                                full_text,
                                {
                                    "model": model_info["label"],
                                    "model_id": body.model,
                                    "tokens": accounted_tokens,
                                    "latency_ms": duration_ms,
                                    "generation_ms": duration_ms,
                                    "provider": model_info["provider"],
                                    "provider_generation_id": provider_generation_id,
                                    "request_options": {
                                        "model_id": body.model,
                                        "temperature": body.temperature,
                                        "max_tokens": body.max_tokens,
                                        "top_p": body.top_p,
                                        "system_message": body.system_message,
                                    },
                                    "generation_summary": generation_summary,
                                    "generation_trace": generation_trace,
                                },
                            )
                    except Exception as exc:
                        logger.warning(
                            "[stream] assistant_message_persist_failed",
                            extra={"error": f"{type(exc).__name__}: {exc}"},
                        )

        return StreamingResponse(stream_with_save(), media_type="text/event-stream")

    result = await _generate_once(body)

    generation_summary = {
        "started_at_ms": None,
        "completed_at_ms": None,
        "duration_ms": result.usage.latency_ms,
        "first_token_ms": result.usage.latency_ms,
        "history_count": history_count,
        "project_chat_count": project_chat_count,
        "project_context_used": project_context_used,
        "stream_chunks": 0,
        "stream_chars": len(result.text),
        "estimated_tokens": result.usage.completion_tokens,
        "prompt_tokens": result.usage.prompt_tokens,
        "completion_tokens": result.usage.completion_tokens,
        "total_tokens": result.usage.total_tokens,
        "model_label": model_info["label"],
        "model_id": body.model,
        "provider": result.provider,
        "provider_generation_id": result.raw.get("provider_generation_id") if isinstance(result.raw, dict) else None,
        "finish_reason": result.raw.get("finish_reason") if isinstance(result.raw, dict) else None,
        "continued_passes": result.raw.get("continued_passes") if isinstance(result.raw, dict) else 0,
        "truncated": bool(result.raw.get("truncated")) if isinstance(result.raw, dict) else False,
        "can_continue": bool(result.raw.get("truncated")) if isinstance(result.raw, dict) else False,
        "cost_usd": (
            result.raw.get("usage", {}).get("cost_usd")
            if isinstance(result.raw, dict) and isinstance(result.raw.get("usage"), dict)
            else 0.0
        ),
    }
    generation_trace = _build_generation_trace(
        duration_ms=result.usage.latency_ms,
        first_token_ms=result.usage.latency_ms,
        history_count=history_count,
        project_chat_count=project_chat_count,
        project_context_used=project_context_used,
        stream_chunks=0,
        stream_chars=len(result.text),
        estimated_tokens=result.usage.completion_tokens,
        is_streaming=False,
    )

    if body.session_id:
        meta = {
            "model": model_info["label"],
            "model_id": body.model,
            "tokens": result.usage.total_tokens,
            "latency_ms": result.usage.latency_ms,
            "generation_ms": result.usage.latency_ms,
            "provider": result.provider,
            "provider_generation_id": result.raw.get("provider_generation_id") if isinstance(result.raw, dict) else None,
            "request_options": {
                "model_id": body.model,
                "temperature": body.temperature,
                "max_tokens": body.max_tokens,
                "top_p": body.top_p,
                "system_message": body.system_message,
            },
            "generation_summary": generation_summary,
            "generation_trace": generation_trace,
        }
        await _save_assistant_message(db, body, result.text, meta)

    # Increment token usage after non-stream generation
    if user_email and result.usage.total_tokens > 0:
        try:
            await increment_daily_usage(db, user_email, result.usage.total_tokens)
        except Exception:
            pass

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
        "[generate/multi] requested",
        extra={
            "mode": body.mode,
            "model": body.model,
            "prompt_len": len(body.prompt),
            "history": len(body.history),
            "session_id": body.session_id,
        },
    )

    await check_daily_token_limit(db, user_email)

    session = await _ensure_session(
        db=db,
        session_id=body.session_id,
        prompt=body.prompt,
        user_email=user_email,
        enforce_owner=True,
        project_id=body.project_id,
    )
    await _save_user_message(db, body.session_id, body.prompt)

    fork_context = await _build_fork_context_budgeted(db, session)
    if fork_context:
        if body.system_message and body.system_message.strip():
            body.system_message = f"{fork_context}\n\n{body.system_message}"
        else:
            body.system_message = fork_context

    # Inject project instructions + cross-chat context
    project_context, project_chat_count = await _build_project_context_budgeted(db, session)
    if project_context:
        if body.system_message and body.system_message.strip():
            body.system_message = f"{project_context}\n\n{body.system_message}"
        else:
            body.system_message = project_context

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

    # Increment token usage for multi-generate
    total_multi_tokens = sum(
        getattr(r, "usage", None) and r.usage.total_tokens or 0
        for r in ([primary_result, secondary_result] if body.mode == "compare" else results)
    ) if body.mode == "compare" else sum(r.usage.total_tokens for r in results if r.usage)
    if total_multi_tokens > 0:
        try:
            await increment_daily_usage(db, user_email, total_multi_tokens)
        except Exception:
            pass

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
            history=body.history,
            history_limit=body.history_limit,
        )
    except Exception as exc:
        logger.error(f"[refine] Failed: {type(exc).__name__}: {exc}")
        if isinstance(exc, (ValueError, json.JSONDecodeError)):
            raise HTTPException(status_code=502, detail="invalid_tutor_review") from exc
        if isinstance(exc, RuntimeError) and str(exc) == "no_client":
            raise HTTPException(status_code=503, detail="tutor_review_unavailable") from exc
        if isinstance(exc, RuntimeError) and str(exc) == "llm_capacity_timeout":
            raise HTTPException(status_code=503, detail="tutor_review_busy") from exc
        raise HTTPException(status_code=502, detail="tutor_review_unavailable") from exc


@limiter.limit(RATE_LIMIT_REFINE)
@router.post("/prompt-suggestions")
async def prompt_suggestions(
    request: Request,
    body: PromptSuggestionsRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    history = await _build_prompt_suggestion_history(db, body)
    try:
        suggestions = await generate_prompt_suggestions_with_llm(
            language=body.language,
            level=body.level,
            history=history,
        )
        return {"suggestions": suggestions}
    except Exception as exc:
        logger.warning(f"[prompt-suggestions] Failed: {type(exc).__name__}: {exc}")
        if not history:
            return {"suggestions": fallback_prompt_suggestions(body.language)}
        if isinstance(exc, RuntimeError) and str(exc) == "no_client":
            raise HTTPException(status_code=503, detail="prompt_suggestions_unavailable") from exc
        if isinstance(exc, RuntimeError) and str(exc) == "llm_capacity_timeout":
            raise HTTPException(status_code=503, detail="prompt_suggestions_busy") from exc
        raise HTTPException(status_code=502, detail="prompt_suggestions_unavailable") from exc
