import json
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    Project,
    UserExperienceProfile,
    UserProfile,
    save_adaptation_decision,
    save_interaction,
)
from dependencies import RATE_LIMIT_ANALYZE, get_current_user, get_db, limiter
from schemas.api import AnalyzeRequest, AnalyzeResponse
from services.aggregation import run_aggregation_for_session
from services.scoring import L2_THRESHOLD, L3_THRESHOLD, compute_score

router = APIRouter()
logger = logging.getLogger("ai-orchestrator")

MIN_USER_LEVEL = 1
MAX_USER_LEVEL = 3
HISTORY_WINDOW_SIZE = 3
PROMOTION_REQUIRED_HIGHER_COUNT = 2
DEMOTION_REQUIRED_LOWER_COUNT = HISTORY_WINDOW_SIZE
GRACE_PERIOD_SESSIONS = 3


def _valid_level(value: int | None) -> int | None:
    return value if value in (1, 2, 3) else None


def _resolve_manual_override(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> int | None:
    exp_override = _valid_level(exp.manual_level_override if exp else None)
    if exp_override is not None:
        return exp_override
    return _valid_level(profile.manual_level_override if profile else None)


def _load_level_history(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> list[int]:
    try:
        history = json.loads((exp.level_history_json if exp else None) or "[]")
    except (json.JSONDecodeError, TypeError):
        history = []

    if not history:
        try:
            history = json.loads((profile.level_history_json if profile else None) or "[]")
        except (json.JSONDecodeError, TypeError):
            history = []

    return [level for level in history if level in (1, 2, 3)]


def _resolve_previous_auto_level(
    profile: UserProfile | None,
    exp: UserExperienceProfile | None,
) -> int:
    return (
        _valid_level(exp.current_level if exp else None)
        or _valid_level(profile.current_level if profile else None)
        or MIN_USER_LEVEL
    )


def _compute_auto_level(
    *,
    previous_auto_level: int,
    suggested_level: int,
    previous_history: list[int],
    level_floor: int = 1,
) -> tuple[int, list[int], dict]:
    """Apply hysteresis to the real adaptive level, excluding manual override.

    level_floor controls the minimum allowed level after demotion:
      - 1 (default): full 3-level range, no restrictions
      - 2: L1 blocked — used when user has projects that only exist at L2+
    """
    history = [*previous_history, suggested_level][-HISTORY_WINDOW_SIZE:]
    higher_count = sum(1 for level in history if level > previous_auto_level)
    lower_count = sum(1 for level in history if level < previous_auto_level)
    all_lower = (
        len(history) == HISTORY_WINDOW_SIZE
        and lower_count >= DEMOTION_REQUIRED_LOWER_COUNT
    )

    auto_level = previous_auto_level
    transition_reason: dict = {}

    if higher_count >= PROMOTION_REQUIRED_HIGHER_COUNT and previous_auto_level < MAX_USER_LEVEL:
        auto_level = previous_auto_level + 1
        transition_reason["action"] = "promotion"
        transition_reason["higher_count"] = higher_count
    elif all_lower and previous_auto_level > level_floor:
        proposed_level = previous_auto_level - 1
        if proposed_level < level_floor:
            transition_reason["action"] = "demotion_blocked_by_floor"
            transition_reason["level_floor"] = level_floor
            transition_reason["lower_count"] = lower_count
        else:
            auto_level = proposed_level
            transition_reason["action"] = "demotion"
            transition_reason["lower_count"] = lower_count

    if not transition_reason:
        transition_reason["action"] = "no_change"

    transition_reason["history"] = history
    transition_reason["suggested_level"] = suggested_level
    transition_reason["previous_auto_level"] = previous_auto_level
    transition_reason["auto_level"] = auto_level
    transition_reason["level_floor"] = level_floor

    return auto_level, history, transition_reason


@limiter.limit(RATE_LIMIT_ANALYZE)
@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
) -> AnalyzeResponse:
    typing_speed = body.metrics.chars_per_second if body.metrics else 0.0
    metrics_dict = body.metrics.model_dump() if body.metrics else {}

    result = await db.execute(select(UserProfile).where(UserProfile.user_email == user_email))
    profile = result.scalars().first()
    if not profile:
        profile = UserProfile(user_email=user_email)
        db.add(profile)

    exp_result = await db.execute(
        select(UserExperienceProfile).where(UserExperienceProfile.user_email == user_email)
    )
    exp = exp_result.scalars().first()
    if not exp:
        exp = UserExperienceProfile(user_email=user_email)
        db.add(exp)

    user_features: dict = {}
    try:
        user_features = json.loads(exp.profile_features_json or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    suggested_level, confidence, reasons, score, normalized, breakdown, ml_info = compute_score(
        body,
        user_features=user_features,
    )

    # Determine level floor: if user has any projects, L1 is blocked because
    # projects are not available at L1 — downgrading would break their workspace.
    project_count_result = await db.execute(
        select(func.count(Project.id)).where(Project.user_email == user_email)
    )
    has_projects = (project_count_result.scalar() or 0) > 0
    level_floor = 2 if has_projects else MIN_USER_LEVEL

    previous_history = _load_level_history(profile, exp)
    previous_auto_level = _resolve_previous_auto_level(profile, exp)
    auto_level, history, transition_reason = _compute_auto_level(
        previous_auto_level=previous_auto_level,
        suggested_level=suggested_level,
        previous_history=previous_history,
        level_floor=level_floor,
    )

    # Grace period: for new users with fewer than GRACE_PERIOD_SESSIONS sessions,
    # suppress level changes until enough data is accumulated.
    sessions_count = user_features.get("sessions_count", 0)
    if sessions_count < GRACE_PERIOD_SESSIONS and auto_level != previous_auto_level:
        auto_level = previous_auto_level
        transition_reason["action"] = "grace_period_no_change"
        transition_reason["sessions_count"] = sessions_count
        transition_reason["grace_period"] = GRACE_PERIOD_SESSIONS
        logger.info(
            "[analyze] grace_period: level change suppressed",
            extra={"sessions": sessions_count, "would_have": auto_level, "kept": previous_auto_level},
        )

    manual_override = _resolve_manual_override(profile, exp)
    manual_override_active = manual_override is not None
    effective_ui_level = manual_override or auto_level
    transition_reason["manual_override_active"] = manual_override_active
    transition_reason["manual_level_override"] = manual_override
    transition_reason["effective_ui_level"] = effective_ui_level

    # UserExperienceProfile.current_level stores auto_level, never forced UI.
    exp.current_level = auto_level
    exp.level_history_json = json.dumps(history)
    exp.suggested_level_last = suggested_level
    exp.rule_score_last = round(score, 4)
    exp.ml_score_last = ml_info.get("ml_score")
    exp.confidence_last = round(confidence, 4)

    # Legacy sync also stores auto_level. Manual override remains separate.
    profile.current_level = auto_level
    profile.level_history_json = json.dumps(history)

    await db.commit()

    await save_interaction(
        db=db,
        session_id=body.session_id,
        chat_id=body.chat_id,
        user_email=user_email,
        user_level=effective_ui_level,
        prompt_text=body.prompt_text,
        score=score,
        normalized=normalized,
        typing_speed=typing_speed,
        metrics=metrics_dict,
    )

    breakdown_dicts = [b.model_dump() for b in breakdown]
    await save_adaptation_decision(
        db=db,
        user_email=user_email,
        session_id=body.session_id,
        chat_id=body.chat_id,
        rule_score=round(score, 4),
        rule_level=suggested_level,
        ml_score=ml_info.get("ml_score"),
        ml_level=ml_info.get("ml_level"),
        ml_confidence=ml_info.get("ml_confidence"),
        final_level=auto_level,
        previous_level=previous_auto_level,
        confidence=round(confidence, 4),
        transition_reason=transition_reason,
        rule_breakdown=breakdown_dicts,
    )

    try:
        await run_aggregation_for_session(
            db,
            user_email=user_email,
            session_id=body.session_id,
            chat_id=body.chat_id,
        )
    except Exception:
        logger.warning(
            "Aggregation pipeline failed for session %s",
            body.session_id,
            exc_info=True,
        )

    return AnalyzeResponse(
        suggested_level=suggested_level,
        final_level=effective_ui_level,
        auto_level=auto_level,
        effective_ui_level=effective_ui_level,
        manual_level_override=manual_override,
        manual_override_active=manual_override_active,
        previous_auto_level=previous_auto_level,
        confidence=confidence,
        reasoning=reasons,
        score=score,
        normalized_score=normalized,
        breakdown=breakdown,
        thresholds={"L2": L2_THRESHOLD, "L3": L3_THRESHOLD},
    )
