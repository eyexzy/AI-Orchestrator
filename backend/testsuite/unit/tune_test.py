import numpy as np
import pytest

from ml_tuning import tune_all_models, tune_hyperparameters


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


class _FakeSearch:
    def __init__(self, estimator, param_grid, scoring, cv, n_jobs, refit):
        self.estimator = estimator
        self.param_grid = param_grid
        self.scoring = scoring
        self.cv = cv
        self.n_jobs = n_jobs
        self.refit = refit

    def fit(self, X, y):
        key = next(iter(self.param_grid))
        self.best_params_ = {key: self.param_grid[key][0]}
        self.best_score_ = 0.75
        self.cv_results_ = {"params": [{key: value} for value in self.param_grid[key]]}
        return self


def test_tune_hyperparameters_rejects_empty_data():
    with pytest.raises(ValueError, match="No data for tuning"):
        tune_hyperparameters([], np.empty((0, 8)), np.array([]), "RandomForest")


def test_tune_hyperparameters_rejects_unknown_model():
    texts, behavioral, y = _sample()
    with pytest.raises(ValueError, match="Unsupported model_type"):
        tune_hyperparameters(texts, behavioral, y, "SVC")


def test_tune_hyperparameters_returns_grid_result(monkeypatch):
    texts, behavioral, y = _sample()
    monkeypatch.setattr("ml_tuning.GridSearchCV", _FakeSearch)
    result = tune_hyperparameters(texts, behavioral, y, "LogisticRegression")
    assert result["model_type"] == "LogisticRegression"
    assert result["cv_folds"] >= 2
    assert result["param_grid_size"] > 0
    assert "C" in result["best_params"]


@pytest.mark.asyncio
async def test_tune_all_models_returns_both_results(monkeypatch):
    texts, behavioral, y = _sample()

    async def fake_load_tuning_data(min_real_samples=10):
        return texts, behavioral, y

    monkeypatch.setattr("ml_tuning.GridSearchCV", _FakeSearch)
    monkeypatch.setattr("ml_tuning.load_tuning_data", fake_load_tuning_data)
    result = await tune_all_models()
    assert result["dataset_size"] == 6
    assert "random_forest" in result
    assert "logistic_regression" in result
