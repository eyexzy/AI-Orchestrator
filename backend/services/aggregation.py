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


def _int(value: object) -> int:
    return int(value or 0)


# Layer 2: raw events -> session_metrics

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

    # Advanced actions: explicit controls and higher-effort AI workflow modes.
    advanced_types = {
        "model_changed", "temperature_changed", "top_p_changed",
        "system_prompt_edited", "variable_added", "few_shot_added",
        "compare_enabled", "self_consistency_enabled",
        "project_context_used", "project_source_used",
    }
    advanced_count = sum(counts.get(t, 0) for t in advanced_types)
    advanced_mode_diversity = sum(1 for t in advanced_types if counts.get(t, 0) > 0)

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
    sm.tutor_open_count = counts.get("tutor_opened", 0)
    sm.tutor_guided_started_count = counts.get("tutor_guided_started", 0)
    sm.tutor_guided_completed_count = counts.get("tutor_guided_completed", 0)
    sm.tutor_guided_abandoned_count = counts.get("tutor_guided_abandoned", 0)
    sm.tutor_helpfulness_rated_count = counts.get("tutor_helpfulness_rated", 0)
    sm.tutor_questions_skipped_count = counts.get("tutor_questions_skipped", 0)
    sm.template_inserted_count = counts.get("template_inserted", 0)
    sm.suggestion_clicked_count = counts.get("suggestion_clicked", 0)
    sm.compare_enabled_count = counts.get("compare_enabled", 0)
    sm.self_consistency_enabled_count = counts.get("self_consistency_enabled", 0)
    sm.few_shot_added_count = counts.get("few_shot_added", 0)
    sm.system_prompt_edited_count = counts.get("system_prompt_edited", 0)
    sm.variable_added_count = counts.get("variable_added", 0)
    sm.regeneration_count = counts.get("regenerate", 0)
    sm.continue_generation_count = counts.get("continue_generation", 0)
    sm.message_feedback_positive_count = counts.get("response_feedback_like", 0)
    sm.message_feedback_negative_count = counts.get("response_feedback_dislike", 0)
    sm.project_context_usage_count = counts.get("project_context_used", 0) + counts.get("project_source_used", 0)
    sm.attachment_usage_count = counts.get("attachment_added", 0)
    sm.advanced_mode_diversity = advanced_mode_diversity
    sm.refine_accept_count = counts.get("refine_accepted", 0)
    sm.refine_reject_count = counts.get("refine_rejected", 0)
    sm.advanced_actions_count = advanced_count
    sm.cancel_actions_count = counts.get("cancel_action", 0)
    sm.backtracking_count = counts.get("backtracking_detected", 0)
    sm.session_duration_seconds = round(duration_seconds, 1)
    sm.task_success_proxy = round(task_success, 3)

    await db.flush()
    return sm


# Layer 3: session_metrics (rolling N) -> user profile features

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
    total_prompts = sum(_int(s.prompts_count) for s in sessions)
    avg_prompt_lengths = [s.avg_prompt_length for s in sessions if s.avg_prompt_length > 0]
    structured_ratios = [s.structured_prompt_ratio for s in sessions]
    durations = [s.session_duration_seconds for s in sessions if s.session_duration_seconds > 0]

    total_tooltip = sum(_int(s.tooltip_open_count) for s in sessions)
    total_tutor_open = sum(_int(s.tutor_open_count) for s in sessions)
    total_tutor_started = sum(_int(s.tutor_guided_started_count) for s in sessions)
    total_tutor_completed = sum(_int(s.tutor_guided_completed_count) for s in sessions)
    total_tutor_abandoned = sum(_int(s.tutor_guided_abandoned_count) for s in sessions)
    total_tutor_rated = sum(_int(s.tutor_helpfulness_rated_count) for s in sessions)
    total_tutor_skipped = sum(_int(s.tutor_questions_skipped_count) for s in sessions)
    total_templates = sum(_int(s.template_inserted_count) for s in sessions)
    total_suggestions = sum(_int(s.suggestion_clicked_count) for s in sessions)
    total_compare = sum(_int(s.compare_enabled_count) for s in sessions)
    total_self_consistency = sum(_int(s.self_consistency_enabled_count) for s in sessions)
    total_few_shot = sum(_int(s.few_shot_added_count) for s in sessions)
    total_system_prompt = sum(_int(s.system_prompt_edited_count) for s in sessions)
    total_variables = sum(_int(s.variable_added_count) for s in sessions)
    total_regeneration = sum(_int(s.regeneration_count) for s in sessions)
    total_continue = sum(_int(s.continue_generation_count) for s in sessions)
    total_positive_feedback = sum(_int(s.message_feedback_positive_count) for s in sessions)
    total_negative_feedback = sum(_int(s.message_feedback_negative_count) for s in sessions)
    total_project_context = sum(_int(s.project_context_usage_count) for s in sessions)
    total_attachments = sum(_int(s.attachment_usage_count) for s in sessions)
    advanced_diversities = [_int(s.advanced_mode_diversity) for s in sessions]
    total_refine_accept = sum(_int(s.refine_accept_count) for s in sessions)
    total_refine_reject = sum(_int(s.refine_reject_count) for s in sessions)
    total_advanced = sum(_int(s.advanced_actions_count) for s in sessions)
    total_cancel = sum(_int(s.cancel_actions_count) for s in sessions)
    total_backtrack = sum(_int(s.backtracking_count) for s in sessions)

    refine_total = total_refine_accept + total_refine_reject
    tutor_finished = total_tutor_completed + total_tutor_abandoned
    message_feedback_total = total_positive_feedback + total_negative_feedback
    task_success_proxies = [
        s.task_success_proxy
        for s in sessions
        if (_int(s.refine_accept_count) + _int(s.refine_reject_count)) > 0
        and s.task_success_proxy is not None
    ]

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
        "tutor_open_count": total_tutor_open,
        "tutor_guided_started_count": total_tutor_started,
        "tutor_guided_completed_count": total_tutor_completed,
        "tutor_guided_abandoned_count": total_tutor_abandoned,
        "tutor_completion_rate": round(total_tutor_completed / tutor_finished, 3) if tutor_finished > 0 else None,
        "tutor_helpfulness_rated_count": total_tutor_rated,
        "tutor_questions_skipped_count": total_tutor_skipped,
        "help_ratio": round((total_tooltip + total_tutor_open) / max(total_prompts, 1), 3),

        # Refine behavior
        "refine_accept_rate": round(total_refine_accept / refine_total, 3) if refine_total > 0 else None,
        "refine_total": refine_total,

        # Advanced feature adoption
        "advanced_actions_per_session": round(total_advanced / n, 2),
        "advanced_actions_total": total_advanced,
        "template_inserted_count": total_templates,
        "suggestion_clicked_count": total_suggestions,
        "compare_enabled_count": total_compare,
        "self_consistency_enabled_count": total_self_consistency,
        "few_shot_added_count": total_few_shot,
        "system_prompt_edited_count": total_system_prompt,
        "variable_added_count": total_variables,
        "project_context_usage_count": total_project_context,
        "attachment_usage_count": total_attachments,
        "advanced_mode_diversity": round(statistics.mean(advanced_diversities), 2) if advanced_diversities else 0.0,

        # Negative signals
        "cancel_rate": round(total_cancel / max(total_prompts, 1), 3),
        "backtracking_rate": round(total_backtrack / max(total_prompts, 1), 3),
        "regeneration_count": total_regeneration,
        "continue_generation_count": total_continue,

        # Task success
        "task_success_proxy_avg": round(statistics.mean(task_success_proxies), 3) if task_success_proxies else None,
        "message_feedback_positive_rate": round(total_positive_feedback / message_feedback_total, 3) if message_feedback_total > 0 else None,
        "message_feedback_negative_rate": round(total_negative_feedback / message_feedback_total, 3) if message_feedback_total > 0 else None,

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


# Orchestrator

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
