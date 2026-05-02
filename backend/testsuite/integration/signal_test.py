import json

import pytest
from sqlalchemy import select

from database import AdaptationFeedback, ChatMessage, ChatMessageFeedback, ChatSession, MLFeedback, ProductFeedback, UserExperienceProfile
from routers.chat_message_feedback import delete_chat_message_feedback, save_chat_message_feedback
from routers.adaptation_feedback import submit_adaptation_feedback
from routers.feedback import ml_feedback
from routers.product_feedback import ProductFeedbackRequest, create_product_feedback
from schemas.api import AdaptationFeedbackCreate, BehavioralMetrics, ChatMessageFeedbackRequest, TrainingFeedback

USER = "signals@test.dev"


@pytest.mark.asyncio
async def test_product_feedback_route_saves_row(db, req):
    result = await create_product_feedback(
        request=req(path="/product-feedback"),
        body=ProductFeedbackRequest(mood="smile", feedback_text="Nice flow", session_id="sess-p"),
        db=db,
        user_email=USER,
    )
    assert result["ok"] is True
    saved = await db.execute(select(ProductFeedback).where(ProductFeedback.user_email == USER))
    row = saved.scalars().first()
    assert row is not None
    assert row.mood == "smile"
    assert row.feedback_text == "Nice flow"


@pytest.mark.asyncio
async def test_adaptation_feedback_route_autofills_snapshot(db, req):
    exp = UserExperienceProfile(
        user_email=USER,
        current_level=2,
        suggested_level_last=3,
        rule_score_last=6.5,
        ml_score_last=0.81,
        confidence_last=0.72,
        profile_features_json=json.dumps({"total_prompts": 11, "advanced_actions_total": 4}),
    )
    db.add(exp)
    await db.commit()
    response = await submit_adaptation_feedback(
        request=req(path="/adaptation-feedback"),
        body=AdaptationFeedbackCreate(
            session_id="sess-a",
            chat_id="chat-a",
            ui_level_at_time=2,
            suggested_level_at_time=3,
            question_type="periodic_level_check",
            answer_value="agree",
        ),
        db=db,
        user_email=USER,
    )
    assert response.feature_snapshot["total_prompts"] == 11
    assert response.feature_snapshot["_current_level"] == 2
    saved = await db.execute(select(AdaptationFeedback).where(AdaptationFeedback.user_email == USER))
    assert saved.scalars().first() is not None


@pytest.mark.asyncio
async def test_ml_feedback_route_saves_labeled_sample(db, req):
    result = await ml_feedback(
        request=req(path="/ml/feedback"),
        data=TrainingFeedback(
            prompt_text="Write a structured Python study plan with milestones.",
            metrics=BehavioralMetrics(
                chars_per_second=3.2,
                session_message_count=4,
                avg_prompt_length=58,
                used_advanced_features_count=2,
                tooltip_click_count=1,
            ),
            actual_level=2,
        ),
        db=db,
        user_email=USER,
    )
    assert result["ok"] is True
    saved = await db.execute(select(MLFeedback).where(MLFeedback.user_email == USER))
    row = saved.scalars().first()
    assert row is not None
    assert row.actual_level == 2
    assert row.prompt_text.startswith("Write a structured")


@pytest.mark.asyncio
async def test_chat_message_feedback_route_saves_and_clears_vote(db, req):
    session = ChatSession(id="chat-feedback", user_email=USER, title="Chat")
    db.add(session)
    await db.commit()

    message = ChatMessage(
        session_id=session.id,
        role="assistant",
        content="Here is the answer",
        metadata_json=json.dumps({
            "provider": "openrouter",
            "model_id": "gemini-2.0-flash",
            "provider_generation_id": "gen_123",
        }),
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    saved_response = await save_chat_message_feedback(
        request=req(path=f"/chat-messages/{message.id}/feedback"),
        message_id=message.id,
        body=ChatMessageFeedbackRequest(vote="like"),
        db=db,
        user_email=USER,
    )
    assert saved_response.ok is True
    assert saved_response.vote == "like"
    assert saved_response.provider_forwarded is False

    saved = await db.execute(select(ChatMessageFeedback).where(ChatMessageFeedback.message_id == message.id))
    row = saved.scalars().first()
    assert row is not None
    assert row.vote == "like"
    assert row.provider_generation_id == "gen_123"

    refreshed_message = await db.get(ChatMessage, message.id)
    metadata = json.loads(refreshed_message.metadata_json)
    assert metadata["user_feedback"]["vote"] == "like"

    cleared_response = await delete_chat_message_feedback(
        request=req(path=f"/chat-messages/{message.id}/feedback", method="DELETE"),
        message_id=message.id,
        db=db,
        user_email=USER,
    )
    assert cleared_response.ok is True
    assert cleared_response.vote is None

    remaining = await db.execute(select(ChatMessageFeedback).where(ChatMessageFeedback.message_id == message.id))
    assert remaining.scalars().first() is None

    refreshed_message = await db.get(ChatMessage, message.id)
    metadata = json.loads(refreshed_message.metadata_json)
    assert "user_feedback" not in metadata
