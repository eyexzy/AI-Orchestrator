import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

import ml_classifier
from database import MLFeedback
from dependencies import get_current_user, get_db, limiter
from schemas.api import TrainingFeedback
from services.cache import cache
from services.scoring import get_semantic_score, has_structured_patterns

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()

ADMIN_STATS_CACHE_KEY = "admin:stats"
ADMIN_ML_STATS_CACHE_KEY = "admin:stats:ml"


async def _invalidate_admin_stats_cache() -> None:
    await cache.delete_many([ADMIN_STATS_CACHE_KEY, ADMIN_ML_STATS_CACHE_KEY])


@limiter.limit("20/minute")
@router.post("/ml/feedback")
async def ml_feedback(
    request: Request,
    data: TrainingFeedback,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    metrics_dict = {
        "chars_per_second": data.metrics.chars_per_second,
        "session_message_count": data.metrics.session_message_count,
        "avg_prompt_length": data.metrics.avg_prompt_length,
        "used_advanced_features_count": getattr(data.metrics, "used_advanced_features_count", 0),
        "tooltip_click_count": getattr(data.metrics, "tooltip_click_count", 0),
    }
    try:
        features = ml_classifier.extract_features(
            data.prompt_text,
            metrics_dict,
            get_semantic_score,
            has_structured_patterns,
        )
    except Exception as e:
        logger.error(f"[ml/feedback] Feature extraction failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=400, detail="Feature extraction failed")

    row = MLFeedback(
        user_email=user_email,
        prompt_text=data.prompt_text,
        prompt_length=float(features[0]),
        word_count=float(features[1]),
        tech_term_count=float(features[2]),
        has_structure=float(features[3]),
        chars_per_second=float(features[4]),
        session_message_count=float(features[5]),
        avg_prompt_length=float(features[6]),
        used_advanced_features_count=float(features[7]),
        tooltip_click_count=float(features[8]),
        actual_level=data.actual_level,
    )
    db.add(row)
    await db.commit()
    await _invalidate_admin_stats_cache()
    return {"ok": True, "message": "Feedback saved"}