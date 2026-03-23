import pytest
from schemas.api import AnalyzeRequest, BehavioralMetrics
from services.scoring import _count_specificity_signals, _score_prompt_craftsmanship, _apply_penalties, compute_score

def _make_request(text: str, **metrics_kwargs) -> AnalyzeRequest:
    return AnalyzeRequest(prompt_text=text, metrics=BehavioralMetrics(**metrics_kwargs))

def _quick_score(text: str, metrics: dict | None=None, user_features: dict | None=None):
    req = _make_request(text, **metrics or {})
    level, confidence, reasons, score, normalized, breakdown, ml_info = compute_score(req, user_features=user_features)
    return (level, score, normalized, reasons)

def test_specificity_counts_constraints():
    text = 'Write a story for beginners, no more than 500 words, avoid complex vocabulary'
    assert _count_specificity_signals(text) >= 3

def test_specificity_jargon_only_scores_zero():
    text = 'API JSON LLM transformer embedding fine-tuning RAG vector tokenizer'
    assert _count_specificity_signals(text) == 0

def test_specificity_non_technical_high():
    text = 'Act as a nutritionist. Give me a weekly meal plan for a family of 4. Budget: no more than $100/week. Avoid gluten. Format as a table with columns: Day, Breakfast, Lunch, Dinner. For example, Monday: oatmeal, salad, grilled chicken.'
    assert _count_specificity_signals(text) >= 4

def test_non_technical_well_crafted_prompt_scores_high():
    text = 'You are an experienced pastry chef. Give me 3 dessert recipes for beginners. Each recipe must have no more than 5 ingredients. Format: numbered list with preparation time. Avoid recipes that need an oven. For example: No-bake cheesecake (20 min, 4 ingredients).'
    reasons: list[str] = []
    score, bd = _score_prompt_craftsmanship(text, reasons)
    assert score >= 2.0, f'Well-crafted non-technical prompt scored only {score}'

def test_jargon_short_prompt_scores_low():
    text = 'API JSON LLM transformer fine-tuning RAG'
    reasons: list[str] = []
    score, bd = _score_prompt_craftsmanship(text, reasons)
    assert score < 1.0, f'Jargon-only short prompt scored {score}'

def test_simple_question_scores_low():
    text = 'What is Python?'
    reasons: list[str] = []
    score, bd = _score_prompt_craftsmanship(text, reasons)
    assert score < 0.5

def test_polite_prompt_not_penalized():
    base_text = 'Act as a data analyst. Give me a summary of sales trends for Q1. Format as bullet points with percentages.'
    polite_text = 'Please, act as a data analyst. Could you kindly give me a summary of sales trends for Q1? Thank you! Format as bullet points with percentages.'
    base_reasons: list[str] = []
    polite_reasons: list[str] = []
    base_score, _ = _score_prompt_craftsmanship(base_text, base_reasons)
    polite_score, _ = _score_prompt_craftsmanship(polite_text, polite_reasons)
    assert polite_score >= base_score

def test_penalties_have_no_politeness():
    score, penalties = _apply_penalties(user_features={}, score=5.0, reasons=[])
    penalty_categories = [p.category for p in penalties]
    assert 'Penalty: Politeness' not in penalty_categories
    assert score == 5.0

def test_same_prompt_novice_vs_expert_behavior():
    text = 'Help me write a business proposal'
    novice_metrics = {'chars_per_second': 1.5, 'session_message_count': 1, 'avg_prompt_length': 30.0, 'used_advanced_features_count': 0, 'tooltip_click_count': 5}
    expert_metrics = {'chars_per_second': 8.0, 'session_message_count': 15, 'avg_prompt_length': 200.0, 'used_advanced_features_count': 4, 'tooltip_click_count': 0, 'used_system_prompt': True, 'used_variables': True, 'changed_model': True}
    expert_features = {'sessions_count': 10, 'advanced_actions_per_session': 3.5, 'structured_prompt_ratio_rolling': 0.6, 'cancel_rate': 0.0, 'help_ratio': 0.0, 'total_prompts': 50}
    _, novice_score, _, _ = _quick_score(text, novice_metrics)
    _, expert_score, _, _ = _quick_score(text, expert_metrics, expert_features)
    assert expert_score > novice_score * 2, f'Expert behavior ({expert_score}) should clearly outscore novice behavior ({novice_score}) even with the same prompt text'

def test_well_crafted_non_tech_prompt_with_expert_behavior_gets_high_level():
    text = "You are an experienced children's book editor. Review the following story draft and provide feedback in 3 sections: 1) Plot structure issues 2) Language appropriateness for ages 6-8 3) Suggestions for illustrations. Be concise — no more than 200 words total. Avoid generic praise; focus on actionable improvements."
    metrics = {'chars_per_second': 7.0, 'session_message_count': 8, 'avg_prompt_length': 180.0, 'used_advanced_features_count': 2, 'tooltip_click_count': 0, 'used_system_prompt': True}
    features = {'sessions_count': 6, 'advanced_actions_per_session': 2.0, 'structured_prompt_ratio_rolling': 0.4, 'cancel_rate': 0.0, 'help_ratio': 0.0, 'total_prompts': 30}
    level, score, normalized, reasons = _quick_score(text, metrics, features)
    assert level >= 2, f'Non-technical expert should be level >= 2, got {level} (score={score}, normalized={normalized})'
