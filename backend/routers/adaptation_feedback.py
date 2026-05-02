"""
Adaptation feedback router — explicit user labels for the adaptation engine.

Separated from product feedback (mood/text in /ml/feedback) to avoid
polluting ML training data with fake mood→level mappings.
"""

import json
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AdaptationFeedback, UserExperienceProfile
from dependencies import get_current_user, get_db, limiter
from schemas.api import AdaptationFeedbackCreate, AdaptationFeedbackResponse

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()


@limiter.limit("30/minute")
@router.post("/adaptation-feedback", response_model=AdaptationFeedbackResponse)
async def submit_adaptation_feedback(
    request: Request,
    body: AdaptationFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
) -> AdaptationFeedbackResponse:
    """Save explicit adaptation feedback with a feature snapshot.

    This endpoint captures the user's explicit assessment of their level
    or agreement/disagreement with the system's suggestion, alongside
    a snapshot of the current user features for future ML training.
    """

    feature_snapshot = body.feature_snapshot
    exp_result = await db.execute(
        select(UserExperienceProfile).where(
            UserExperienceProfile.user_email == user_email
        )
    )
    exp = exp_result.scalars().first()

    if exp:
        if not feature_snapshot:
            try:
                feature_snapshot = json.loads(exp.profile_features_json or "{}")
            except (json.JSONDecodeError, TypeError):
                feature_snapshot = {}

        auto_level = exp.current_level
        manual_override = exp.manual_level_override if exp.manual_level_override in (1, 2, 3) else None
        effective_ui_level = manual_override or auto_level

        feature_snapshot.setdefault("auto_level_at_time", auto_level)
        feature_snapshot.setdefault("effective_ui_level_at_time", effective_ui_level)
        feature_snapshot.setdefault("manual_override_active", manual_override is not None)
        feature_snapshot.setdefault("manual_level_override", manual_override)
        feature_snapshot.setdefault("suggested_level_at_time", exp.suggested_level_last)
        feature_snapshot["_current_level"] = auto_level
        feature_snapshot["_suggested_level_last"] = exp.suggested_level_last
        feature_snapshot["_rule_score_last"] = exp.rule_score_last
        feature_snapshot["_ml_score_last"] = exp.ml_score_last
        feature_snapshot["_confidence_last"] = exp.confidence_last

    row = AdaptationFeedback(
        user_email=user_email,
        session_id=body.session_id,
        chat_id=body.chat_id,
        ui_level_at_time=body.ui_level_at_time,
        suggested_level_at_time=body.suggested_level_at_time,
        question_type=body.question_type,
        answer_value=body.answer_value,
        feature_snapshot_json=json.dumps(feature_snapshot, ensure_ascii=False, default=str),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return AdaptationFeedbackResponse(
        id=row.id,
        user_email=row.user_email,
        session_id=row.session_id,
        chat_id=row.chat_id,
        ui_level_at_time=row.ui_level_at_time,
        suggested_level_at_time=row.suggested_level_at_time,
        question_type=row.question_type,
        answer_value=row.answer_value,
        feature_snapshot=json.loads(row.feature_snapshot_json or "{}"),
        created_at=row.created_at,
    )
