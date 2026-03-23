"""
Aggregation pipeline: raw events -> session_metrics -> user profile features.

Layer 2: session_metrics — per-session aggregates from user_events.
Layer 3: user_experience_profile.profile_features_json — rolling user-level features.
"""

import json
import logging
import statistics
from datetime import datetime, timezone

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    UserEvent,
    SessionMetrics,
    UserExperienceProfile,
    InteractionLog,
)

logger = logging.getLogger("ai-orchestrator")

ROLLING_SESSION_WINDOW = 10


# ---------------------------------------------------------------------------
# Layer 2: raw events -> session_metrics
# ---------------------------------------------------------------------------

async def aggregate_session(
    db: AsyncSession,
    *,
    user_email: str,
    session_id: str,
    chat_id: str | None = None,
) -> SessionMetrics:
    """Build or update session_metrics row from raw events for a given session."""

    # Count events by type
    stmt = (
        select(UserEvent.event_type, func.count(UserEvent.id))
        .where(
            and_(
                UserEvent.session_id == session_id,
                UserEvent.user_email == user_email,
            )
        )
        .group_by(UserEvent.event_type)
    )
    result = await db.execute(stmt)
    counts: dict[str, int] = {row[0]: row[1] for row in result.all()}

    # Compute session duration from first/last event
    time_stmt = (
        select(
            func.min(UserEvent.created_at).label("first_at"),
            func.max(UserEvent.created_at).label("last_at"),
        )
        .where(
            and_(
                UserEvent.session_id == session_id,
                UserEvent.user_email == user_email,
            )
        )
    )
    time_result = await db.execute(time_stmt)
    time_row = time_result.one_or_none()
    duration_seconds = 0.0
    if time_row and time_row.first_at and time_row.last_at:
        duration_seconds = (time_row.last_at - time_row.first_at).total_seconds()

    # Get prompt lengths from interaction_logs for this session
    il_stmt = (
        select(InteractionLog.prompt_text)
        .where(
            and_(
                InteractionLog.session_id == session_id,
                InteractionLog.user_email == user_email,
            )
        )
        .order_by(InteractionLog.timestamp)
    )
    il_result = await db.execute(il_stmt)
    prompts = [row[0] for row in il_result.all() if row[0]]
    prompt_lengths = [len(p) for p in prompts]
    prompts_count = counts.get("prompt_submitted", 0) or len(prompts)

    avg_len = statistics.mean(prompt_lengths) if prompt_lengths else 0.0
    median_len = statistics.median(prompt_lengths) if prompt_lengths else 0.0

    # Structured prompt ratio: check how many prompts have structured patterns
    structured_count = 0
    if prompts:
        from services.scoring import has_structured_patterns
        structured_count = sum(1 for p in prompts if has_structured_patterns(p))
    structured_ratio = structured_count / len(prompts) if prompts else 0.0

    # Advanced actions: model_changed + temperature_changed + top_p_changed +
    #   system_prompt_edited + variable_added + few_shot_added + compare_enabled +
    #   self_consistency_enabled
    advanced_types = {
        "model_changed", "temperature_changed", "top_p_changed",
        "system_prompt_edited", "variable_added", "few_shot_added",
        "compare_enabled", "self_consistency_enabled",
    }
    advanced_count = sum(counts.get(t, 0) for t in advanced_types)

    # Task success proxy: accept ratio among refine interactions
    refine_total = counts.get("refine_accepted", 0) + counts.get("refine_rejected", 0)
    task_success = counts.get("refine_accepted", 0) / refine_total if refine_total > 0 else 0.0

    # Upsert session_metrics
    existing_stmt = (
        select(SessionMetrics)
        .where(
            and_(
                SessionMetrics.session_id == session_id,
                SessionMetrics.user_email == user_email,
            )
        )
    )
    existing_result = await db.execute(existing_stmt)
    sm = existing_result.scalars().first()

    if not sm:
        sm = SessionMetrics(
            user_email=user_email,
            session_id=session_id,
            chat_id=chat_id,
        )
        db.add(sm)

    sm.prompts_count = prompts_count
    sm.avg_prompt_length = round(avg_len, 1)
    sm.median_prompt_length = round(median_len, 1)
    sm.structured_prompt_ratio = round(structured_ratio, 3)
    sm.tooltip_open_count = counts.get("tooltip_opened", 0)
    sm.refine_accept_count = counts.get("refine_accepted", 0)
    sm.refine_reject_count = counts.get("refine_rejected", 0)
    sm.advanced_actions_count = advanced_count
    sm.cancel_actions_count = counts.get("cancel_action", 0)
    sm.backtracking_count = counts.get("backtracking_detected", 0)
    sm.session_duration_seconds = round(duration_seconds, 1)
    sm.task_success_proxy = round(task_success, 3)

    await db.flush()
    return sm


# ---------------------------------------------------------------------------
# Layer 3: session_metrics (rolling N) -> user profile features
# ---------------------------------------------------------------------------

async def aggregate_user_profile(
    db: AsyncSession,
    *,
    user_email: str,
    window: int = ROLLING_SESSION_WINDOW,
) -> dict:
    """Compute rolling user-level features from the last N session_metrics rows."""

    stmt = (
        select(SessionMetrics)
        .where(SessionMetrics.user_email == user_email)
        .order_by(SessionMetrics.created_at.desc())
        .limit(window)
    )
    result = await db.execute(stmt)
    sessions: list[SessionMetrics] = list(result.scalars().all())

    if not sessions:
        return {}

    n = len(sessions)

    # Rolling aggregates
    total_prompts = sum(s.prompts_count for s in sessions)
    avg_prompt_lengths = [s.avg_prompt_length for s in sessions if s.avg_prompt_length > 0]
    structured_ratios = [s.structured_prompt_ratio for s in sessions]
    durations = [s.session_duration_seconds for s in sessions if s.session_duration_seconds > 0]

    total_tooltip = sum(s.tooltip_open_count for s in sessions)
    total_refine_accept = sum(s.refine_accept_count for s in sessions)
    total_refine_reject = sum(s.refine_reject_count for s in sessions)
    total_advanced = sum(s.advanced_actions_count for s in sessions)
    total_cancel = sum(s.cancel_actions_count for s in sessions)
    total_backtrack = sum(s.backtracking_count for s in sessions)

    refine_total = total_refine_accept + total_refine_reject
    task_success_proxies = [s.task_success_proxy for s in sessions if (s.refine_accept_count + s.refine_reject_count) > 0]

    features: dict = {
        # Volume
        "sessions_count": n,
        "total_prompts": total_prompts,
        "avg_prompts_per_session": round(total_prompts / n, 1),

        # Prompt complexity
        "avg_prompt_length_rolling": round(statistics.mean(avg_prompt_lengths), 1) if avg_prompt_lengths else 0.0,
        "structured_prompt_ratio_rolling": round(statistics.mean(structured_ratios), 3) if structured_ratios else 0.0,

        # Session engagement
        "avg_session_duration_s": round(statistics.mean(durations), 1) if durations else 0.0,
        "median_session_duration_s": round(statistics.median(durations), 1) if durations else 0.0,

        # Help-seeking vs self-sufficiency
        "tooltip_opens_per_session": round(total_tooltip / n, 2),
        "help_ratio": round(total_tooltip / max(total_prompts, 1), 3),

        # Refine behavior
        "refine_accept_rate": round(total_refine_accept / refine_total, 3) if refine_total > 0 else None,
        "refine_total": refine_total,

        # Advanced feature adoption
        "advanced_actions_per_session": round(total_advanced / n, 2),
        "advanced_actions_total": total_advanced,

        # Negative signals
        "cancel_rate": round(total_cancel / max(total_prompts, 1), 3),
        "backtracking_rate": round(total_backtrack / max(total_prompts, 1), 3),

        # Task success
        "task_success_proxy_avg": round(statistics.mean(task_success_proxies), 3) if task_success_proxies else None,

        # Recency — timestamp of latest session
        "latest_session_at": sessions[0].created_at.isoformat() if sessions[0].created_at else None,
    }

    # Persist into UserExperienceProfile
    exp_stmt = select(UserExperienceProfile).where(
        UserExperienceProfile.user_email == user_email
    )
    exp_result = await db.execute(exp_stmt)
    exp = exp_result.scalars().first()
    if not exp:
        exp = UserExperienceProfile(user_email=user_email)
        db.add(exp)

    exp.profile_features_json = json.dumps(features, ensure_ascii=False, default=str)
    await db.flush()

    return features


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run_aggregation_for_session(
    db: AsyncSession,
    *,
    user_email: str,
    session_id: str,
    chat_id: str | None = None,
) -> dict:
    """Full pipeline: raw events -> session_metrics -> user profile features.

    Call this after /analyze or on a periodic basis.
    Returns the updated user-level feature dict.
    """
    await aggregate_session(
        db,
        user_email=user_email,
        session_id=session_id,
        chat_id=chat_id,
    )
    features = await aggregate_user_profile(db, user_email=user_email)
    await db.commit()
    return features
