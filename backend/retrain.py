"""
CLI script and reusable function for retraining the ML classifier.
Supports train/test split, cross-validation, and full evaluation metrics.

Uses dataset_builder for tiered label collection (gold/silver/bronze).
"""
import json
import sys
import asyncio
import argparse
import logging
import functools

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


def _augment_missing_classes_for_fit(
    texts: list[str],
    behavioral_X: np.ndarray,
    y: np.ndarray,
    sample_weight: np.ndarray | None = None,
) -> tuple[list[str], np.ndarray, np.ndarray, np.ndarray | None]:
    """Add low-weight synthetic rows when a tiny slice has fewer than 2 classes."""
    present = {int(label) for label in y.tolist()}
    if len(present) >= 2:
        return texts, behavioral_X, y, sample_weight

    synthetic_texts, synthetic_behavioral, synthetic_y = _create_synthetic_training_data()
    extra_texts: list[str] = []
    extra_behavioral: list[np.ndarray] = []
    extra_y: list[int] = []

    for level in (1, 2, 3):
        if level in present:
            continue
        idx = int(np.where(synthetic_y == level)[0][0])
        extra_texts.append(synthetic_texts[idx])
        extra_behavioral.append(synthetic_behavioral[idx])
        extra_y.append(level)

    if not extra_y:
        return texts, behavioral_X, y, sample_weight

    fit_texts = [*texts, *extra_texts]
    fit_behavioral = np.vstack([behavioral_X, np.asarray(extra_behavioral, dtype=float)])
    fit_y = np.concatenate([y, np.asarray(extra_y, dtype=y.dtype)])
    base_weight = sample_weight if sample_weight is not None else np.ones(len(y), dtype=float)
    fit_weight = np.concatenate([
        base_weight,
        np.full(len(extra_y), 0.05, dtype=float),
    ])

    return fit_texts, fit_behavioral, fit_y, fit_weight


def _load_data_from_rows(rows: list) -> tuple[list[str], np.ndarray, np.ndarray]:
    """Extract texts, behavioral features, and labels from legacy MLFeedback rows."""
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
    sample_weight: np.ndarray | None = None,
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
    can_split = n_classes >= 2 and min_class_count >= 4 and n_samples >= 12

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
        train_w = sample_weight[train_idx] if sample_weight is not None else None

        # Train with sample weights
        clf.fit(train_texts, train_beh, train_y, sample_weight=train_w)

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
        fit_texts, fit_behavioral, fit_y, fit_weight = _augment_missing_classes_for_fit(
            texts,
            behavioral_X,
            y,
            sample_weight,
        )
        clf.fit(fit_texts, fit_behavioral, fit_y, sample_weight=fit_weight)

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
    """CLI-callable retrain function using the tiered dataset builder."""
    from dataset_builder import build_dataset

    texts, behavioral_X, y, sample_weights, stats = await build_dataset(
        min_samples=min_samples,
    )

    print(f"[retrain] Dataset: {stats['total']} samples "
          f"(gold={stats['gold']}, silver={stats['silver']}, "
          f"bronze={stats['bronze']}, synthetic={stats['synthetic']})")

    # Class distribution
    for lvl in (1, 2, 3):
        count = stats["class_distribution"].get(lvl, 0)
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

    # Run CPU-bound training in a thread so the async event loop stays free.
    _train = functools.partial(
        train_and_evaluate,
        texts, behavioral_X, y,
        model_type=model_type,
        model_params=model_params,
        sample_weight=sample_weights,
    )
    result = await asyncio.to_thread(_train)
    clf = result["classifier"]
    result["tuning"] = tuning_result
    result["dataset_stats"] = stats

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
