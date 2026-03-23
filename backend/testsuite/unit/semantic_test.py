import os
import importlib
import pytest

def test_offline_env_vars_set_on_import():
    import services.scoring
    assert os.environ.get('HF_HUB_OFFLINE') == '1'
    assert os.environ.get('TRANSFORMERS_OFFLINE') == '1'

def test_get_semantic_score_returns_zero_before_warmup():
    import services.scoring as scoring
    scoring._semantic_model = None
    scoring._reference_vector = None
    scoring._semantic_available = False
    assert scoring.get_semantic_score('Python async generators') == 0.0

def test_warmup_loads_model_and_enables_scoring():
    import services.scoring as scoring
    ok = scoring.warmup_semantic_model()
    if not ok:
        pytest.skip('SentenceTransformer model not in local cache — cannot test warmup')
    assert scoring._semantic_available is True
    score = scoring.get_semantic_score('API JSON LLM machine learning optimization deployment')
    assert isinstance(score, float)
    assert score > 0.0

def test_warmup_is_idempotent():
    import services.scoring as scoring
    ok1 = scoring.warmup_semantic_model()
    ok2 = scoring.warmup_semantic_model()
    if ok1:
        assert ok2 is True
