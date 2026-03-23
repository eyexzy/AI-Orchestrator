import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    UserProfile,
    UserExperienceProfile,
    save_interaction,
    save_adaptation_decision,
)
from dependencies import RATE_LIMIT_ANALYZE, get_current_user, get_db, limiter
from schemas.api import AnalyzeRequest, AnalyzeResponse
from services.scoring import L2_THRESHOLD, L3_THRESHOLD, compute_score
from services.aggregation import run_aggregation_for_session

router = APIRouter()

MIN_USER_LEVEL = 1
MAX_USER_LEVEL = 3
HISTORY_WINDOW_SIZE = 3
PROMOTION_REQUIRED_HIGHER_COUNT = 2
DEMOTION_REQUIRED_LOWER_COUNT = HISTORY_WINDOW_SIZE


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

    # Load or create UserProfile (legacy)
    result = await db.execute(select(UserProfile).where(UserProfile.user_email == user_email))
    profile = result.scalars().first()
    if not profile:
        profile = UserProfile(user_email=user_email)
        db.add(profile)

    # Load or create UserExperienceProfile
    exp_result = await db.execute(
        select(UserExperienceProfile).where(UserExperienceProfile.user_email == user_email)
    )
    exp = exp_result.scalars().first()
    if not exp:
        exp = UserExperienceProfile(user_email=user_email)
        db.add(exp)

    # Load user features for Rule Engine V2
    user_features: dict = {}
    try:
        user_features = json.loads(exp.profile_features_json or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    suggested_level, confidence, reasons, score, normalized, breakdown, ml_info = compute_score(
        body, user_features=user_features,
    )

    # Hysteresis logic — UserExperienceProfile is the source of truth
    try:
        history: list[int] = json.loads(exp.level_history_json or "[]")
    except json.JSONDecodeError:
        history = []
    # Backfill: if exp history is empty but legacy profile has data, seed from it
    if not history:
        try:
            history = json.loads(profile.level_history_json or "[]")
        except json.JSONDecodeError:
            history = []
    history.append(suggested_level)
    history = history[-HISTORY_WINDOW_SIZE:]

    current = exp.current_level if exp.current_level in (1, 2, 3) else (
        profile.current_level if profile.current_level in (1, 2, 3) else MIN_USER_LEVEL
    )
    previous_level = current

    higher_count = sum(1 for level in history if level > current)
    lower_count = sum(1 for level in history if level < current)
    all_lower = (
        len(history) == HISTORY_WINDOW_SIZE and
        lower_count >= DEMOTION_REQUIRED_LOWER_COUNT
    )

    final_level = current
    transition_reason: dict = {}

    if higher_count >= PROMOTION_REQUIRED_HIGHER_COUNT and current < MAX_USER_LEVEL:
        final_level = current + 1
        transition_reason["action"] = "promotion"
        transition_reason["higher_count"] = higher_count
    if all_lower and current > MIN_USER_LEVEL:
        final_level = current - 1
        transition_reason["action"] = "demotion"
        transition_reason["lower_count"] = lower_count

    # Manual override — UserExperienceProfile takes precedence
    override = exp.manual_level_override
    if override is None:
        override = profile.manual_level_override
    if override is not None:
        final_level = override
        transition_reason["action"] = "manual_override"
        transition_reason["override_value"] = override

    if not transition_reason:
        transition_reason["action"] = "no_change"

    transition_reason["history"] = history
    transition_reason["suggested_level"] = suggested_level

    # Persist — UserExperienceProfile is the source of truth, sync to legacy
    exp.current_level = final_level
    exp.level_history_json = json.dumps(history)
    exp.suggested_level_last = suggested_level
    exp.rule_score_last = round(score, 4)
    exp.ml_score_last = ml_info.get("ml_score")
    exp.confidence_last = round(confidence, 4)

    # Sync to legacy UserProfile for backward compat
    profile.current_level = final_level
    profile.level_history_json = json.dumps(history)

    await db.commit()

    # Log interaction (session_id = real behavioral session UUID, chat_id = persistent chat)
    await save_interaction(
        db=db,
        session_id=body.session_id,
        chat_id=body.chat_id,
        user_email=user_email,
        user_level=final_level,
        prompt_text=body.prompt_text,
        score=score,
        normalized=normalized,
        typing_speed=typing_speed,
        metrics=metrics_dict,
    )

    # Log adaptation decision
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
        final_level=final_level,
        previous_level=previous_level,
        confidence=round(confidence, 4),
        transition_reason=transition_reason,
        rule_breakdown=breakdown_dicts,
    )

    # Aggregation pipeline: raw events -> session_metrics -> user profile
    try:
        await run_aggregation_for_session(
            db,
            user_email=user_email,
            session_id=body.session_id,
            chat_id=body.chat_id,
        )
    except Exception:
        # Aggregation failure must not break the analyze response
        import logging
        logging.getLogger("ai-orchestrator").warning(
            "Aggregation pipeline failed for session %s", body.session_id, exc_info=True,
        )

    return AnalyzeResponse(
        suggested_level=suggested_level,
        final_level=final_level,
        confidence=confidence,
        reasoning=reasons,
        score=score,
        normalized_score=normalized,
        breakdown=breakdown,
        thresholds={"L2": L2_THRESHOLD, "L3": L3_THRESHOLD},
    )
