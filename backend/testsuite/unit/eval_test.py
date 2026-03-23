import numpy as np

from ml_evaluation import ablation_study, compare_models, random_baseline


def _sample():
    texts = [
        "simple ai question",
        "explain neural networks simply",
        "compare rag and fine tuning in a table",
        "how to tune prompt parameters for different tasks",
        "design a fastapi websocket llm service with redis cache",
        "analyze transformer attention complexity with pytorch examples",
    ]
    behavioral = np.array([
        [20, 4, 0, 1.0, 1, 20, 0, 1],
        [35, 6, 0, 1.5, 2, 28, 0, 1],
        [90, 16, 1, 4.0, 4, 85, 2, 0],
        [100, 18, 0, 4.5, 5, 95, 2, 0],
        [220, 40, 1, 7.5, 9, 210, 4, 0],
        [260, 48, 1, 8.5, 10, 230, 5, 0],
    ], dtype=float)
    y = np.array([1, 1, 2, 2, 3, 3])
    return texts, behavioral, y


def test_random_baseline_returns_expected_shape():
    result = random_baseline(np.array([1, 1, 2, 2, 3, 3]))
    assert set(result) == {"random", "majority"}
    assert set(result["random"]) == {"accuracy", "f1"}
    assert set(result["majority"]) == {"accuracy", "f1", "class"}


def test_compare_models_returns_all_model_blocks():
    texts, behavioral, y = _sample()
    result = compare_models(texts, behavioral, y)
    assert set(result) == {"LogisticRegression", "RandomForest", "SVC"}
    for metrics in result.values():
        assert "train_accuracy" in metrics
        assert "cv_f1_mean" in metrics
        assert "confusion_matrix" in metrics


def test_ablation_study_returns_expected_sections():
    texts, behavioral, y = _sample()
    result = ablation_study(texts, behavioral, y)
    assert "feature_importances" in result
    assert "behavioral_importances" in result
    assert "drop_one_results" in result
    assert "baseline_f1" in result
