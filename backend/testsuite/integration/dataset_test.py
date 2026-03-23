import json

import pytest

from database import AdaptationDecision, AdaptationFeedback, InteractionLog, MLFeedback
from dataset_builder import _build_bronze_samples, _build_gold_samples, _build_silver_samples

USER = "dataset@test.dev"


@pytest.mark.asyncio
async def test_dataset_builders_cover_gold_silver_bronze(db):
    db.add(
        InteractionLog(
            user_email=USER,
            session_id="gold-s",
            chat_id="chat-gold",
            prompt_text="Build a study roadmap with milestones.",
            metrics_json=json.dumps(
                {
                    "chars_per_second": 3.0,
                    "session_message_count": 3,
                    "avg_prompt_length": 44,
                    "used_advanced_features_count": 1,
                    "tooltip_click_count": 0,
                }
            ),
        )
    )
    db.add(
        AdaptationFeedback(
            user_email=USER,
            session_id="gold-s",
            chat_id="chat-gold",
            ui_level_at_time=2,
            suggested_level_at_time=2,
            question_type="self_assess_level",
            answer_value="2",
            feature_snapshot_json="{}",
        )
    )
    db.add(
        InteractionLog(
            user_email=USER,
            session_id="silver-s",
            chat_id="chat-silver",
            prompt_text="Create a Python project checklist with testing steps.",
            metrics_json=json.dumps(
                {
                    "chars_per_second": 4.0,
                    "session_message_count": 5,
                    "avg_prompt_length": 60,
                    "used_advanced_features_count": 2,
                    "tooltip_click_count": 1,
                }
            ),
        )
    )
    db.add(
        AdaptationDecision(
            user_email=USER,
            session_id="silver-s",
            chat_id="chat-silver",
            final_level=3,
            confidence=0.91,
        )
    )
    db.add(
        MLFeedback(
            user_email=USER,
            prompt_text="Summarize AI basics in bullet points.",
            prompt_length=40,
            word_count=8,
            tech_term_count=1,
            has_structure=1,
            chars_per_second=2.5,
            session_message_count=2,
            avg_prompt_length=40,
            used_advanced_features_count=0,
            tooltip_click_count=1,
            actual_level=1,
        )
    )
    await db.commit()
    gold = await _build_gold_samples(db)
    silver = await _build_silver_samples(db, gold_session_ids={"gold-s"})
    bronze = await _build_bronze_samples(db)
    assert len(gold) == 1
    assert gold[0].tier == "gold"
    assert gold[0].label == 2
    assert len(silver) == 1
    assert silver[0].tier == "silver"
    assert silver[0].label == 3
    assert len(bronze) == 1
    assert bronze[0].tier == "bronze"
    assert bronze[0].label == 1
