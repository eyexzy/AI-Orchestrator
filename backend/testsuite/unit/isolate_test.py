import pytest
from schemas.api import AnalyzeRequest, BehavioralMetrics
from services.scoring import _score_efficiency, _score_autonomy, compute_score, SESSION_ACTIVITY_MEDIUM

class TestEfficiencyBlockSessionIsolation:

    def test_first_prompt_clean_session_low_activity(self):
        metrics = BehavioralMetrics(session_message_count=1, avg_prompt_length=120.0, chars_per_second=4.0)
        reasons: list[str] = []
        score, breakdown = _score_efficiency(metrics, reasons)
        activity_bd = [b for b in breakdown if 'Session Activity' in b.category]
        assert len(activity_bd) == 1
        assert activity_bd[0].points == 0.0

    def test_inflated_count_gives_higher_activity(self):
        metrics = BehavioralMetrics(session_message_count=50, avg_prompt_length=120.0, chars_per_second=4.0)
        reasons: list[str] = []
        score, breakdown = _score_efficiency(metrics, reasons)
        activity_bd = [b for b in breakdown if 'Session Activity' in b.category]
        assert len(activity_bd) == 1
        assert activity_bd[0].points == 1.0

    def test_score_difference_is_significant(self):
        clean_metrics = BehavioralMetrics(session_message_count=1, avg_prompt_length=120.0, chars_per_second=4.0)
        polluted_metrics = BehavioralMetrics(session_message_count=50, avg_prompt_length=120.0, chars_per_second=4.0)
        clean_score, _ = _score_efficiency(clean_metrics, [])
        polluted_score, _ = _score_efficiency(polluted_metrics, [])
        assert polluted_score > clean_score
        assert polluted_score - clean_score >= 0.5

class TestAutonomyBlockSessionIsolation:

    def test_clean_session_no_self_sufficiency(self):
        metrics = BehavioralMetrics(session_message_count=1, tooltip_click_count=0)
        reasons: list[str] = []
        score, breakdown = _score_autonomy(metrics, {}, reasons)
        suf_bd = [b for b in breakdown if 'Self-sufficiency' in b.category]
        assert len(suf_bd) == 1
        assert suf_bd[0].points == 0.0

    def test_inflated_session_with_zero_tooltips_earns_self_sufficiency(self):
        metrics = BehavioralMetrics(session_message_count=50, tooltip_click_count=0)
        reasons: list[str] = []
        score, breakdown = _score_autonomy(metrics, {}, reasons)
        suf_bd = [b for b in breakdown if 'Self-sufficiency' in b.category]
        assert suf_bd[0].points == 1.0

class TestComputeScoreEndToEnd:

    def test_first_prompt_new_session_in_old_chat(self):
        request = AnalyzeRequest(prompt_text='Explain how async generators work in Python with examples', session_id='new-session-uuid', chat_id='old-chat-uuid', metrics=BehavioralMetrics(session_message_count=1, avg_prompt_length=60.0, chars_per_second=5.0))
        level, confidence, reasons, score, normalized, breakdown, ml_info = compute_score(request)
        activity_items = [b for b in breakdown if 'Session Activity' in b.category]
        assert len(activity_items) == 1
        assert activity_items[0].points == 0.0

    def test_polluted_metrics_inflate_score(self):
        clean_request = AnalyzeRequest(prompt_text='Explain how async generators work in Python with examples', session_id='new-session-uuid', chat_id='old-chat-uuid', metrics=BehavioralMetrics(session_message_count=1, avg_prompt_length=60.0, chars_per_second=5.0))
        polluted_request = AnalyzeRequest(prompt_text='Explain how async generators work in Python with examples', session_id='new-session-uuid', chat_id='old-chat-uuid', metrics=BehavioralMetrics(session_message_count=30, avg_prompt_length=200.0, chars_per_second=5.0))
        _, _, _, clean_score, _, _, _ = compute_score(clean_request)
        _, _, _, polluted_score, _, _, _ = compute_score(polluted_request)
        assert polluted_score > clean_score

class TestAvgPromptLengthIsolation:

    def test_avg_prompt_length_affects_efficiency(self):
        low_avg = BehavioralMetrics(session_message_count=1, avg_prompt_length=50.0, chars_per_second=4.0)
        high_avg = BehavioralMetrics(session_message_count=1, avg_prompt_length=300.0, chars_per_second=4.0)
        low_score, low_bd = _score_efficiency(low_avg, [])
        high_score, high_bd = _score_efficiency(high_avg, [])
        low_avg_bd = [b for b in low_bd if 'Avg Prompt Length' in b.category]
        high_avg_bd = [b for b in high_bd if 'Avg Prompt Length' in b.category]
        assert high_avg_bd[0].points > low_avg_bd[0].points
