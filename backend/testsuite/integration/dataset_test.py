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


@pytest.mark.asyncio
async def test_gold_builder_understands_current_micro_feedback_values(db):
    cases = [
        ("self-low", "self_assess_level", "more_guidance", 2, 1),
        ("self-current", "self_assess_level", "current_guidance_fits", 2, 2),
        ("self-high", "self_assess_level", "less_guidance", 2, 3),
        ("level-low", "level_change_agreement", "simpler_layout", 2, 1),
        ("level-current", "level_change_agreement", "current_layout_fits", 2, 2),
        ("level-high", "level_change_agreement", "more_control_needed", 2, 3),
        ("periodic-low", "periodic_level_check", "simpler_layout", 2, 1),
        ("help-low", "help_series_check", "interface_unclear", 2, 1),
        ("help-current", "help_series_check", "learning_feature", 2, 2),
        ("scenario-low", "scenario_satisfaction", "less_clear", 2, 1),
        ("scenario-current", "scenario_satisfaction", "improved", 2, 2),
    ]

    for session_id, question_type, answer_value, base_level, _expected in cases:
        db.add(
            InteractionLog(
                user_email=USER,
                session_id=session_id,
                chat_id=f"chat-{session_id}",
                prompt_text=f"Prompt for {session_id} with enough context.",
                metrics_json=json.dumps(
                    {
                        "chars_per_second": 4.0,
                        "session_message_count": 4,
                        "avg_prompt_length": 48,
                        "used_advanced_features_count": 1,
                        "tooltip_click_count": 0,
                    }
                ),
            )
        )
        db.add(
            AdaptationFeedback(
                user_email=USER,
                session_id=session_id,
                chat_id=f"chat-{session_id}",
                ui_level_at_time=base_level,
                suggested_level_at_time=base_level,
                question_type=question_type,
                answer_value=answer_value,
                feature_snapshot_json=json.dumps({"auto_level_at_time": base_level}),
            )
        )

    await db.commit()

    gold = await _build_gold_samples(db)
    labels_by_session = {sample.prompt_text.split(" ")[2]: sample.label for sample in gold}

    for session_id, _question_type, _answer_value, _base_level, expected in cases:
        assert labels_by_session[session_id] == expected
