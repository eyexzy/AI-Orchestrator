"""
CLI script and reusable function for retraining the ML classifier.
Supports train/test split, cross-validation, and full evaluation metrics.
"""
import json
import sys
import asyncio
import argparse
import logging

import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sqlalchemy import select

from database import AsyncSessionLocal, init_db, MLFeedback, MLModelCache
from ml_classifier import (
    SklearnClassifier,
    ModelType,
    extract_behavioral_features,
    _create_synthetic_training_data,
    BEHAVIORAL_FEATURE_NAMES,
)

logger = logging.getLogger("ml-classifier")


def _load_data_from_rows(rows: list) -> tuple[list[str], np.ndarray, np.ndarray]:
    """Extract texts, behavioral features, and labels from DB rows."""
    texts = [r.prompt_text or "" for r in rows]
    behavioral_X = np.array([
        [r.prompt_length, r.word_count, r.has_structure,
         r.chars_per_second, r.session_message_count, r.avg_prompt_length,
         r.used_advanced_features_count, r.tooltip_click_count]
        for r in rows
    ], dtype=float)
    y = np.array([r.actual_level for r in rows])
    return texts, behavioral_X, y


def train_and_evaluate(
    texts: list[str],
    behavioral_X: np.ndarray,
    y: np.ndarray,
    model_type: ModelType = "LogisticRegression",
    model_params: dict | None = None,
    test_size: float = 0.2,
    cv_folds: int = 5,
) -> dict:
    """
    Full training pipeline:
    1. train/test split (stratified)
    2. cross-validation on train set
    3. evaluation on test set
    Returns dict with metrics + trained classifier.
    """
    n_samples = len(y)
    n_classes = len(set(y))
    min_class_count = min((y == c).sum() for c in set(y))

    # Need at least 2 samples per class in train after split for stratified CV
    can_split = min_class_count >= 4 and n_samples >= 12

    clf = SklearnClassifier(model_type=model_type, model_params=model_params)

    if can_split:
        # Stratified train/test split
        idx = np.arange(n_samples)
        train_idx, test_idx = train_test_split(
            idx, test_size=test_size, stratify=y, random_state=42,
        )
        train_texts = [texts[i] for i in train_idx]
        test_texts = [texts[i] for i in test_idx]
        train_beh, test_beh = behavioral_X[train_idx], behavioral_X[test_idx]
        train_y, test_y = y[train_idx], y[test_idx]

        # Train
        clf.fit(train_texts, train_beh, train_y)

        # Cross-validation on training set — adapt folds to data size
        min_train_class = min((train_y == c).sum() for c in set(train_y))
        actual_folds = min(cv_folds, min_train_class)
        actual_folds = max(2, actual_folds)

        X_train_combined = clf._build_features(train_texts, train_beh, fit=False)
        skf = StratifiedKFold(n_splits=actual_folds, shuffle=True, random_state=42)
        cv_scores = cross_val_score(
            clf.model, X_train_combined, train_y, cv=skf, scoring="f1_macro",
        )

        # Evaluate on test set
        X_test_combined = clf._build_features(test_texts, test_beh, fit=False)
        test_pred = clf.model.predict(X_test_combined)
        test_accuracy = accuracy_score(test_y, test_pred)
        test_f1 = f1_score(test_y, test_pred, average="macro", zero_division=0)
        report = classification_report(
            test_y, test_pred, labels=[1, 2, 3],
            target_names=["L1 Novice", "L2 Intermediate", "L3 Expert"],
            output_dict=True, zero_division=0,
        )
        cm = confusion_matrix(test_y, test_pred, labels=[1, 2, 3]).tolist()
    else:
        # Not enough data for proper split — train on all, no test metrics
        clf.fit(texts, behavioral_X, y)

        X_all = clf._build_features(texts, behavioral_X, fit=False)
        all_pred = clf.model.predict(X_all)
        test_accuracy = accuracy_score(y, all_pred)
        test_f1 = f1_score(y, all_pred, average="macro", zero_division=0)
        report = classification_report(
            y, all_pred, labels=[1, 2, 3],
            target_names=["L1 Novice", "L2 Intermediate", "L3 Expert"],
            output_dict=True, zero_division=0,
        )
        cm = confusion_matrix(y, all_pred, labels=[1, 2, 3]).tolist()
        cv_scores = np.array([test_f1])

    return {
        "classifier": clf,
        "accuracy": round(float(test_accuracy), 4),
        "f1_macro": round(float(test_f1), 4),
        "cv_f1_mean": round(float(cv_scores.mean()), 4),
        "cv_f1_std": round(float(cv_scores.std()), 4),
        "cv_folds": actual_folds if can_split else 0,
        "classification_report": report,
        "confusion_matrix": cm,
        "samples_total": n_samples,
        "samples_train": int(n_samples * (1 - test_size)) if can_split else n_samples,
        "samples_test": int(n_samples * test_size) if can_split else 0,
        "model_type": model_type,
        "model_params": dict(model_params or {}),
        "had_proper_split": can_split,
    }


async def retrain_from_db(
    min_samples: int = 10,
    model_type: ModelType = "LogisticRegression",
    use_tuning: bool = True,
):
    """CLI-callable retrain function."""
    await init_db()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MLFeedback))
        rows = result.scalars().all()

    print(f"[retrain] Loaded {len(rows)} samples from database")

    if len(rows) < min_samples:
        # Fallback to synthetic + real data combined
        syn_texts, syn_beh, syn_y = _create_synthetic_training_data()
        if rows:
            real_texts, real_beh, real_y = _load_data_from_rows(rows)
            texts = list(syn_texts) + list(real_texts)
            behavioral_X = np.vstack([syn_beh, real_beh])
            y = np.concatenate([syn_y, real_y])
            print(f"[retrain] Combined {len(syn_texts)} synthetic + {len(real_texts)} real samples")
        else:
            texts, behavioral_X, y = list(syn_texts), syn_beh, syn_y
            print(f"[retrain] Using {len(syn_texts)} synthetic samples only")
    else:
        texts, behavioral_X, y = _load_data_from_rows(rows)

    # Class distribution
    for lvl in (1, 2, 3):
        count = int((y == lvl).sum())
        print(f"[retrain]   L{lvl}: {count} samples ({count / len(y) * 100:.1f}%)")

    tuning_result = None
    model_params = None
    if use_tuning and model_type in ("LogisticRegression", "RandomForest"):
        try:
            from ml_tuning import tune_hyperparameters

            tuning_result = tune_hyperparameters(texts, behavioral_X, y, model_type)
            model_params = tuning_result.get("best_params") or None
            print(f"[retrain] Tuning applied: {model_params}")
        except Exception as exc:
            logger.warning(
                "[retrain] Hyperparameter tuning skipped: %s: %s",
                type(exc).__name__,
                exc,
            )

    result = train_and_evaluate(
        texts,
        behavioral_X,
        y,
        model_type=model_type,
        model_params=model_params,
    )
    clf = result["classifier"]
    result["tuning"] = tuning_result

    print(f"[retrain] Model: {model_type}")
    print(f"[retrain] Accuracy: {result['accuracy']:.1%}")
    print(f"[retrain] F1 macro: {result['f1_macro']:.1%}")
    if result["had_proper_split"]:
        print(f"[retrain] CV F1: {result['cv_f1_mean']:.3f} ± {result['cv_f1_std']:.3f} ({result['cv_folds']}-fold)")
    print(f"[retrain] Confusion matrix: {result['confusion_matrix']}")

    # Persist to DB
    weights_json = json.dumps(clf.to_dict())
    report_json = json.dumps(result["classification_report"], ensure_ascii=False)

    async with AsyncSessionLocal() as db:
        db.add(MLModelCache(
            weights_json=weights_json,
            model_type=model_type,
            accuracy=result["accuracy"],
            f1_score=result["f1_macro"],
            classification_report_json=report_json,
            samples_used=result["samples_total"],
        ))
        await db.commit()

    import ml_classifier

    ml_classifier._classifier.from_dict(clf.to_dict())
    print("[retrain] Model saved to database")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Retrain ML classifier")
    parser.add_argument("--min-samples", type=int, default=10)
    parser.add_argument(
        "--model", type=str, default="LogisticRegression",
        choices=["LogisticRegression", "RandomForest", "SVC"],
    )
    parser.add_argument(
        "--no-tuning",
        action="store_true",
        help="Skip GridSearchCV tuning for supported models",
    )
    args = parser.parse_args()
    asyncio.run(retrain_from_db(args.min_samples, args.model, not args.no_tuning))