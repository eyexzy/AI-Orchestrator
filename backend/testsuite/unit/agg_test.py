import pytest
from schemas.api import AnalyzeRequest, BehavioralMetrics
from services.scoring import compute_score, _score_prompt_craftsmanship, _score_tool_mastery, _score_autonomy, _score_efficiency, _score_stability, _apply_penalties, _count_specificity_signals, has_structured_patterns, L2_THRESHOLD, L3_THRESHOLD, MAX_SCORE

def _make_request(text: str, **metrics_kwargs) -> AnalyzeRequest:
    return AnalyzeRequest(prompt_text=text, metrics=BehavioralMetrics(**metrics_kwargs))

def _quick_score(text: str, metrics: dict | None=None, user_features: dict | None=None):
    req = _make_request(text, **metrics or {})
    level, confidence, reasons, score, normalized, breakdown, ml_info = compute_score(req, user_features=user_features)
    return (level, score, normalized, confidence)

class TestLevelThresholds:

    def test_threshold_ordering(self):
        assert L2_THRESHOLD < L3_THRESHOLD

    def test_minimal_input_is_level_1(self):
        level, *_ = _quick_score('hi')
        assert level == 1

    def test_expert_behavior_reaches_level_3(self):
        text = 'You are an expert data engineer. Design a streaming pipeline that handles at least 10k events/sec with exactly-once semantics. Format: numbered architecture steps. Avoid vendor lock-in. For example: Kafka -> Flink -> Iceberg.'
        metrics = {'chars_per_second': 9.0, 'session_message_count': 20, 'avg_prompt_length': 250.0, 'used_advanced_features_count': 5, 'tooltip_click_count': 0, 'used_system_prompt': True, 'used_variables': True, 'changed_model': True, 'changed_temperature': True}
        features = {'sessions_count': 10, 'advanced_actions_per_session': 4.0, 'structured_prompt_ratio_rolling': 0.7, 'cancel_rate': 0.0, 'help_ratio': 0.0, 'total_prompts': 80}
        level, score, normalized, _ = _quick_score(text, metrics, features)
        assert level == 3, f'Expected L3, got L{level} (norm={normalized})'

    def test_moderate_behavior_reaches_level_2(self):
        text = 'Explain the difference between REST and GraphQL. Give me 3 pros and cons of each in a table format.'
        metrics = {'chars_per_second': 5.0, 'session_message_count': 6, 'avg_prompt_length': 100.0, 'used_advanced_features_count': 1, 'changed_model': True}
        features = {'sessions_count': 4, 'advanced_actions_per_session': 1.0, 'structured_prompt_ratio_rolling': 0.3, 'cancel_rate': 0.05, 'help_ratio': 0.1, 'total_prompts': 20}
        level, *_ = _quick_score(text, metrics, features)
        assert level >= 2

class TestMLBlending:

    def test_ml_info_always_present(self):
        req = _make_request('Test prompt')
        _, _, _, _, _, _, ml_info = compute_score(req)
        assert 'ml_level' in ml_info
        assert 'ml_confidence' in ml_info
        assert 'ml_blended' in ml_info

    def test_ml_blending_does_not_override_completely(self):
        text = 'What is Python?'
        req = _make_request(text)
        _, _, _, score_no_ml, norm_no_ml, _, ml_info = compute_score(req)
        if ml_info['ml_blended']:
            assert norm_no_ml < 0.9, 'ML should not push a trivial prompt to near-max'

class TestPenalties:

    def test_no_penalties_for_clean_profile(self):
        score, penalties = _apply_penalties({}, 10.0, [])
        assert score == 10.0
        assert len(penalties) == 0

    def test_high_cancel_rate_penalizes(self):
        features = {'cancel_rate': 0.5, 'total_prompts': 10}
        reasons = []
        score, penalties = _apply_penalties(features, 10.0, reasons)
        assert score < 10.0
        assert any(('cancel' in p.detail.lower() for p in penalties))

    def test_high_help_ratio_penalizes(self):
        features = {'help_ratio': 0.6, 'total_prompts': 10}
        reasons = []
        score, penalties = _apply_penalties(features, 10.0, reasons)
        assert score < 10.0

    def test_score_never_goes_below_zero(self):
        features = {'cancel_rate': 1.0, 'help_ratio': 1.0, 'total_prompts': 100}
        reasons = []
        score, _ = _apply_penalties(features, 1.0, reasons)
        assert score >= 0.0

class TestBlockScoring:

    def test_prompt_craftsmanship_block(self):
        text = 'Act as a nutritionist. Give me a weekly meal plan. Budget: no more than $100/week. Format as a table.'
        reasons = []
        score, bd = _score_prompt_craftsmanship(text, reasons)
        assert score > 0.0

    def test_tool_mastery_with_advanced_features(self):
        metrics = BehavioralMetrics(used_system_prompt=True, used_variables=True, used_advanced_features_count=3)
        reasons = []
        score, bd = _score_tool_mastery(metrics, {}, reasons)
        assert score > 0.0

    def test_tool_mastery_zero_without_features(self):
        metrics = BehavioralMetrics()
        reasons = []
        score, bd = _score_tool_mastery(metrics, {}, reasons)
        assert score == 0.0

    def test_autonomy_rewards_self_sufficiency(self):
        metrics = BehavioralMetrics(session_message_count=5)
        features = {'cancel_rate': 0.0, 'help_ratio': 0.0, 'total_prompts': 20}
        reasons = []
        score, bd = _score_autonomy(metrics, features, reasons)
        assert score > 0.0

    def test_efficiency_rewards_fast_typing(self):
        metrics = BehavioralMetrics(chars_per_second=8.0, session_message_count=10, avg_prompt_length=200.0)
        reasons = []
        score, bd = _score_efficiency(metrics, reasons)
        assert score > 0.0

    def test_stability_with_rolling_history(self):
        features = {'sessions_count': 8, 'total_prompts': 40, 'advanced_actions_per_session': 2.5, 'structured_prompt_ratio_rolling': 0.5, 'cancel_rate': 0.02, 'help_ratio': 0.05}
        reasons = []
        score, bd = _score_stability(features, reasons)
        assert score > 0.0

    def test_stability_zero_without_history(self):
        reasons = []
        score, bd = _score_stability({}, reasons)
        assert score == 0.0

class TestStructuredPatterns:

    def test_numbered_list_is_structured(self):
        assert has_structured_patterns('1. First step\n2. Second step')

    def test_bullet_list_is_structured(self):
        assert has_structured_patterns('- First\n- Second\n- Third')

    def test_plain_sentence_is_not_structured(self):
        assert not has_structured_patterns('Hello world')

    def test_code_block_is_structured(self):
        assert has_structured_patterns("```python\nprint('hello')\n```")

    def test_step_pattern_is_structured(self):
        assert has_structured_patterns('Step 1: do this. Step 2: do that.')
