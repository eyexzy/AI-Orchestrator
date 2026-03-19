"""
Hyperparameter tuning utilities for ML models used in AI-Orchestrator.

Supports GridSearchCV for:
- RandomForestClassifier: n_estimators, max_depth
- LogisticRegression: C
"""
import asyncio
import json
from typing import Literal

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sqlalchemy import select

from database import AsyncSessionLocal, MLFeedback, init_db
from ml_classifier import SklearnClassifier, _create_synthetic_training_data
from retrain import _load_data_from_rows

TuneModelType = Literal["RandomForest", "LogisticRegression"]


async def load_tuning_data(min_real_samples: int = 10) -> tuple[list[str], np.ndarray, np.ndarray]:
    """Load feedback data with synthetic fallback for robust tuning."""
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MLFeedback))
        rows = result.scalars().all()

    syn_texts, syn_beh, syn_y = _create_synthetic_training_data()
    if len(rows) >= min_real_samples:
        return _load_data_from_rows(rows)

    if rows:
        real_texts, real_beh, real_y = _load_data_from_rows(rows)
        return (
            list(syn_texts) + list(real_texts),
            np.vstack([syn_beh, real_beh]),
            np.concatenate([syn_y, real_y]),
        )

    return list(syn_texts), syn_beh, syn_y


def tune_hyperparameters(
    texts: list[str],
    behavioral_X: np.ndarray,
    y: np.ndarray,
    model_type: TuneModelType,
) -> dict:
    """
    Run GridSearchCV for selected model and return best params/score.
    """
    if len(texts) == 0 or len(y) == 0:
        raise ValueError("No data for tuning")

    # Build combined text + behavioral features once.
    base_clf = SklearnClassifier(model_type="LogisticRegression")
    X_combined = base_clf._build_features(texts, behavioral_X, fit=True)

    min_class_count = int(min((y == c).sum() for c in set(y)))
    n_splits = max(2, min(5, min_class_count))
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    if model_type == "RandomForest":
        estimator = RandomForestClassifier(
            class_weight="balanced",
            random_state=42,
        )
        param_grid = {
            "n_estimators": [100, 200, 400],
            "max_depth": [None, 10, 20, 30],
        }
    elif model_type == "LogisticRegression":
        estimator = LogisticRegression(
            class_weight="balanced",
            max_iter=2000,
            random_state=42,
        )
        param_grid = {
            "C": [0.01, 0.1, 1.0, 3.0, 10.0],
        }
    else:
        raise ValueError(f"Unsupported model_type: {model_type}")

    search = GridSearchCV(
        estimator=estimator,
        param_grid=param_grid,
        scoring="f1_macro",
        cv=cv,
        n_jobs=-1,
        refit=True,
    )
    search.fit(X_combined, y)

    return {
        "model_type": model_type,
        "best_params": search.best_params_,
        "best_cv_f1_macro": float(search.best_score_),
        "cv_folds": n_splits,
        "param_grid_size": len(search.cv_results_["params"]),
    }


async def tune_all_models(min_real_samples: int = 10) -> dict:
    """Tune RandomForest and LogisticRegression on the same dataset."""
    texts, behavioral_X, y = await load_tuning_data(min_real_samples=min_real_samples)
    return {
        "dataset_size": int(len(y)),
        "random_forest": tune_hyperparameters(texts, behavioral_X, y, "RandomForest"),
        "logistic_regression": tune_hyperparameters(texts, behavioral_X, y, "LogisticRegression"),
    }


if __name__ == "__main__":
    results = asyncio.run(tune_all_models())
    print(json.dumps(results, ensure_ascii=False, indent=2))