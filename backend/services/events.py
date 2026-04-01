"""
Event ingestion service — stores and queries raw user behavioral events.

Used by the events router and later by the aggregation pipeline (PROMPT-06).
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import UserEvent

logger = logging.getLogger("ai-orchestrator")

# Allowed event types — acts as a whitelist so the frontend can't write arbitrary strings.
# Grouped logically by the Layer-1 spec in AUDIT_REPORT.md.
ALLOWED_EVENT_TYPES: set[str] = {
    # Prompt lifecycle
    "prompt_started",
    "prompt_submitted",
    # Refine flow
    "refine_opened",
    "refine_accepted",
    "refine_rejected",
    # Help / guidance
    "tooltip_opened",
    # Templates & suggestions
    "template_inserted",
    "suggestion_clicked",
    # Model / parameter changes
    "model_changed",
    "temperature_changed",
    "top_p_changed",
    "system_prompt_edited",
    "variable_added",
    "few_shot_added",
    # Advanced modes
    "compare_enabled",
    "self_consistency_enabled",
    # Negative signals
    "cancel_action",
    "backtracking_detected",
    # Explicit feedback on UI level
    "ui_level_feedback_given",
    # Tutor modal flow
    "refine_questions_answered",
    "refine_second_pass_requested",
    "refine_second_pass_accepted",
    "refine_second_pass_rejected",
}


async def save_event(
    db: AsyncSession,
    *,
    user_email: str,
    session_id: str | None,
    chat_id: str | None,
    event_type: str,
    event_context: dict | None = None,
    payload: dict | None = None,
) -> UserEvent:
    event = UserEvent(
        user_email=user_email,
        session_id=session_id,
        chat_id=chat_id,
        event_type=event_type,
        event_context_json=json.dumps(event_context or {}, ensure_ascii=False),
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
    )
    db.add(event)
    await db.flush()
    return event


async def save_events_batch(
    db: AsyncSession,
    *,
    user_email: str,
    events: list[dict],
) -> int:
    """Save multiple events in one flush. Returns count of saved events."""
    for ev in events:
        db.add(UserEvent(
            user_email=user_email,
            session_id=ev.get("session_id"),
            chat_id=ev.get("chat_id"),
            event_type=ev["event_type"],
            event_context_json=json.dumps(ev.get("event_context") or {}, ensure_ascii=False),
            payload_json=json.dumps(ev.get("payload") or {}, ensure_ascii=False),
        ))
    await db.flush()
    return len(events)


async def get_events_by_session(
    db: AsyncSession,
    session_id: str,
    *,
    event_type: str | None = None,
    limit: int = 500,
) -> list[UserEvent]:
    """Fetch events for a given session, optionally filtered by type."""
    stmt = (
        select(UserEvent)
        .where(UserEvent.session_id == session_id)
    )
    if event_type:
        stmt = stmt.where(UserEvent.event_type == event_type)
    stmt = stmt.order_by(UserEvent.created_at).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_events_by_user(
    db: AsyncSession,
    user_email: str,
    *,
    event_type: str | None = None,
    since: datetime | None = None,
    limit: int = 1000,
) -> list[UserEvent]:
    """Fetch events for a given user, optionally filtered by type and time."""
    stmt = (
        select(UserEvent)
        .where(UserEvent.user_email == user_email)
    )
    if event_type:
        stmt = stmt.where(UserEvent.event_type == event_type)
    if since:
        stmt = stmt.where(UserEvent.created_at >= since)
    stmt = stmt.order_by(UserEvent.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_events_by_type(
    db: AsyncSession,
    session_id: str,
) -> dict[str, int]:
    """Count events grouped by event_type for a session. Useful for aggregation."""
    stmt = (
        select(UserEvent.event_type, func.count(UserEvent.id))
        .where(UserEvent.session_id == session_id)
        .group_by(UserEvent.event_type)
    )
    result = await db.execute(stmt)
    return {row[0]: row[1] for row in result.all()}