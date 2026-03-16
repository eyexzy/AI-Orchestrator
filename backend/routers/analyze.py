import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import save_interaction, UserProfile
from dependencies import limiter, get_db
from schemas.api import AnalyzeRequest, AnalyzeResponse
from services.scoring import compute_score, L2_THRESHOLD, L3_THRESHOLD

router = APIRouter()


@limiter.limit("60/minute")
@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: Request, body: AnalyzeRequest, db: AsyncSession = Depends(get_db)) -> AnalyzeResponse:
    suggested_level, confidence, reasons, score, normalized, breakdown = compute_score(body)

    typing_speed = body.metrics.chars_per_second if body.metrics else 0.0
    metrics_dict = body.metrics.model_dump()      if body.metrics else {}

    # user_email as PK — survives page reloads and new sessions
    profile_key = body.user_email if body.user_email != "anonymous" else body.session_id
    result = await db.execute(select(UserProfile).where(UserProfile.user_email == profile_key))
    profile = result.scalars().first()
    if not profile:
        profile = UserProfile(user_email=profile_key)
        db.add(profile)

    try:
        history: list[int] = json.loads(profile.level_history_json or "[]")
    except json.JSONDecodeError:
        history = []
    history.append(suggested_level)
    history = history[-3:]

    current     = profile.current_level or 1
    higher_count = sum(1 for l in history if l > current)
    all_lower    = len(history) == 3 and all(l < current for l in history)

    final_level = current
    if higher_count >= 2 and current < 3:
        final_level = current + 1
    if all_lower and current > 1:
        final_level = current - 1

    # Manual override: if set, force the final level but keep analytics flowing
    if profile.manual_level_override is not None:
        final_level = profile.manual_level_override

    profile.current_level      = final_level
    profile.level_history_json = json.dumps(history)
    profile.consecutive_high   = ((profile.consecutive_high or 0) + 1 if suggested_level > current else 0)
    await db.commit()

    await save_interaction(
        db=db, session_id=body.session_id, user_email=body.user_email,
        user_level=final_level, prompt_text=body.prompt_text,
        score=score, normalized=normalized,
        typing_speed=typing_speed, metrics=metrics_dict,
    )

    return AnalyzeResponse(
        suggested_level= suggested_level, final_level= final_level, confidence= confidence,
        reasoning= reasons, score= score, normalized_score= normalized,
        breakdown= breakdown, thresholds={"L2": L2_THRESHOLD, "L3": L3_THRESHOLD},
    )