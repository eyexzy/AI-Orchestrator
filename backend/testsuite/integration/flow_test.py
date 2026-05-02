import pytest
from schemas.api import AnalyzeRequest, BehavioralMetrics
from services.scoring import compute_score, _count_specificity_signals, has_structured_patterns, L2_THRESHOLD, L3_THRESHOLD, MAX_SCORE

def _simulate_analyze(text: str, metrics: dict, user_features: dict | None=None):
    req = AnalyzeRequest(prompt_text=text, metrics=BehavioralMetrics(**metrics))
    level, confidence, reasons, score, normalized, breakdown, ml_info = compute_score(req, user_features=user_features)
    return {'level': level, 'confidence': confidence, 'reasons': reasons, 'score': score, 'normalized': normalized, 'breakdown': breakdown, 'ml_info': ml_info}

class TestOnboardingToAnalyzeFlow:

    def test_new_user_starts_at_level_1(self):
        result = _simulate_analyze('What is machine learning?', {'chars_per_second': 2.0, 'session_message_count': 1})
        assert result['level'] == 1
        assert result['confidence'] > 0.0

    def test_user_progression_across_session(self):
        r1 = _simulate_analyze('What is Python?', {'chars_per_second': 2.0, 'session_message_count': 1})
        r2 = _simulate_analyze('Explain async/await in Python with 3 examples. Format as numbered list.', {'chars_per_second': 5.0, 'session_message_count': 5, 'avg_prompt_length': 80.0, 'used_advanced_features_count': 1, 'changed_model': True}, user_features={'sessions_count': 2, 'total_prompts': 10, 'advanced_actions_per_session': 0.5, 'structured_prompt_ratio_rolling': 0.2, 'cancel_rate': 0.0, 'help_ratio': 0.1})
        assert r2['score'] > r1['score'], f"Score should improve: {r1['score']} -> {r2['score']}"

    def test_expert_user_full_flow(self):
        text = 'You are a senior backend architect. Design a CQRS + Event Sourcing system for a fintech platform. Requirements:\n1. Handle 50k transactions/sec\n2. Eventual consistency < 100ms\n3. Audit trail for compliance\nAvoid microservice spaghetti. Format: architecture diagram description followed by numbered implementation steps.'
        metrics = {'chars_per_second': 10.0, 'session_message_count': 15, 'avg_prompt_length': 300.0, 'used_advanced_features_count': 5, 'tooltip_click_count': 0, 'used_system_prompt': True, 'used_variables': True, 'changed_model': True, 'changed_temperature': True}
        features = {'sessions_count': 10, 'total_prompts': 80, 'advanced_actions_per_session': 4.0, 'structured_prompt_ratio_rolling': 0.7, 'cancel_rate': 0.0, 'help_ratio': 0.0}
        result = _simulate_analyze(text, metrics, features)
        assert result['level'] == 3
        assert result['normalized'] >= L3_THRESHOLD

class TestDashboardDataCoherence:

    def test_breakdown_covers_all_blocks(self):
        result = _simulate_analyze('Write me a Python script to sort a list', {'chars_per_second': 3.0, 'session_message_count': 2})
        block_names = {b.category for b in result['breakdown'] if b.detail == 'Block total'}
        expected = {'Prompt Craftsmanship', 'Tool Mastery', 'Autonomy', 'Efficiency', 'Stability'}
        assert block_names == expected

    def test_score_within_bounds(self):
        result = _simulate_analyze('Hello', {})
        assert 0 <= result['score'] <= MAX_SCORE
        assert 0 <= result['normalized'] <= 1.0

    def test_confidence_within_bounds(self):
        result = _simulate_analyze('Explain quantum computing', {'session_message_count': 3}, user_features={'sessions_count': 5, 'total_prompts': 20})
        assert 0 <= result['confidence'] <= 1.0

    def test_reasons_list_non_empty(self):
        result = _simulate_analyze('Hi', {})
        assert len(result['reasons']) >= 1

    def test_ml_info_structure(self):
        result = _simulate_analyze('Test', {})
        ml = result['ml_info']
        assert isinstance(ml['ml_level'], int)
        assert isinstance(ml['ml_confidence'], float)
        assert isinstance(ml['ml_blended'], bool)

class TestFeedbackLabelingSeparation:

    def test_product_feedback_schema_independent(self):
        from database import ProductFeedback
        assert hasattr(ProductFeedback, 'mood')
        assert hasattr(ProductFeedback, 'feedback_text')
        assert hasattr(ProductFeedback, 'user_email')

    def test_ml_feedback_schema_independent(self):
        from database import MLFeedback
        assert hasattr(MLFeedback, 'actual_level')
        assert hasattr(MLFeedback, 'prompt_text')
        assert hasattr(MLFeedback, 'user_email')

    def test_no_cross_contamination(self):
        from database import ProductFeedback
        assert not hasattr(ProductFeedback, 'actual_level')

    def test_ml_feedback_no_mood(self):
        from database import MLFeedback
        assert not hasattr(MLFeedback, 'mood')

class TestEventVocabularyConsistency:

    def test_all_aggregation_event_types_in_vocabulary(self):
        from services.events import ALLOWED_EVENT_TYPES
        aggregation_types = {'prompt_submitted', 'tooltip_opened', 'refine_accepted', 'refine_rejected', 'model_changed', 'temperature_changed', 'top_p_changed', 'system_prompt_edited', 'variable_added', 'few_shot_added', 'compare_enabled', 'self_consistency_enabled', 'cancel_action', 'backtracking_detected', 'regenerate', 'continue_generation', 'response_feedback_like', 'response_feedback_dislike', 'project_context_used', 'attachment_added', 'project_source_used'}
        missing = aggregation_types - ALLOWED_EVENT_TYPES
        assert not missing, f'Event types used in aggregation but not in vocabulary: {missing}'

    def test_vocabulary_size(self):
        from services.events import ALLOWED_EVENT_TYPES
        assert len(ALLOWED_EVENT_TYPES) >= 48
