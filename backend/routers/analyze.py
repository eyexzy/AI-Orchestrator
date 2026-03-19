import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import UserProfile, save_interaction
from dependencies import get_current_user, get_db, limiter
from schemas.api import AnalyzeRequest, AnalyzeResponse
from services.scoring import L2_THRESHOLD, L3_THRESHOLD, compute_score

router = APIRouter()

MIN_USER_LEVEL = 1
MAX_USER_LEVEL = 3
HISTORY_WINDOW_SIZE = 3
PROMOTION_REQUIRED_HIGHER_COUNT = 2
DEMOTION_REQUIRED_LOWER_COUNT = HISTORY_WINDOW_SIZE


@limiter.limit("60/minute")
@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
) -> AnalyzeResponse:
    suggested_level, confidence, reasons, score, normalized, breakdown = compute_score(body)

    typing_speed = body.metrics.chars_per_second if body.metrics else 0.0
    metrics_dict = body.metrics.model_dump() if body.metrics else {}

    result = await db.execute(select(UserProfile).where(UserProfile.user_email == user_email))
    profile = result.scalars().first()
    if not profile:
        profile = UserProfile(user_email=user_email)
        db.add(profile)

    try:
        history: list[int] = json.loads(profile.level_history_json or "[]")
    except json.JSONDecodeError:
        history = []
    history.append(suggested_level)
    history = history[-HISTORY_WINDOW_SIZE:]

    current = profile.current_level or MIN_USER_LEVEL
    higher_count = sum(1 for level in history if level > current)
    lower_count = sum(1 for level in history if level < current)
    all_lower = (
        len(history) == HISTORY_WINDOW_SIZE and
        lower_count >= DEMOTION_REQUIRED_LOWER_COUNT
    )

    final_level = current
    if higher_count >= PROMOTION_REQUIRED_HIGHER_COUNT and current < MAX_USER_LEVEL:
        final_level = current + 1
    if all_lower and current > MIN_USER_LEVEL:
        final_level = current - 1

    if profile.manual_level_override is not None:
        final_level = profile.manual_level_override

    profile.current_level = final_level
    profile.level_history_json = json.dumps(history)
    await db.commit()

    await save_interaction(
        db=db,
        session_id=body.session_id,
        user_email=user_email,
        user_level=final_level,
        prompt_text=body.prompt_text,
        score=score,
        normalized=normalized,
        typing_speed=typing_speed,
        metrics=metrics_dict,
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