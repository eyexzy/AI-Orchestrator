import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import ProductFeedback
from dependencies import get_current_user, get_db, limiter

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()


class ProductFeedbackRequest(BaseModel):
    mood: Optional[str] = Field(None, pattern=r"^(sad|neutral|smile)$")
    feedback_text: str = Field(default="", max_length=5000)
    session_id: Optional[str] = None


@limiter.limit("20/minute")
@router.post("/product-feedback")
async def create_product_feedback(
    request: Request,
    body: ProductFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    row = ProductFeedback(
        user_email=user_email,
        session_id=body.session_id,
        mood=body.mood,
        feedback_text=body.feedback_text,
    )
    db.add(row)
    await db.commit()
    return {"ok": True, "message": "Product feedback saved"}
