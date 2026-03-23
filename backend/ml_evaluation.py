"""
ML Evaluation & Ablation Study for diploma thesis.

Usage:
    python ml_evaluation.py                    # full evaluation
    python ml_evaluation.py --ablation         # ablation study only
    python ml_evaluation.py --compare-models   # compare LR vs RF vs SVC

Outputs tables and data suitable for diploma charts/graphs.
"""
import asyncio
import json
import logging
import sys

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import (
    StratifiedKFold,
    cross_val_score,
    learning_curve,
    train_test_split,
)
from ml_classifier import (
    BEHAVIORAL_FEATURE_NAMES,
    ModelType,
    SklearnClassifier,
    _create_synthetic_training_data,
)

logger = logging.getLogger("ml-evaluation")


async def _load_all_data() -> tuple[list[str], np.ndarray, np.ndarray, np.ndarray, dict]:
    """Load data from tiered dataset builder."""
    from dataset_builder import build_dataset

    texts, beh, y, weights, stats = await build_dataset(min_samples=10)
    print(f"  Dataset: gold={stats['gold']}, silver={stats['silver']}, "
          f"bronze={stats['bronze']}, synthetic={stats['synthetic']}")
    return texts, beh, y, weights, stats


def compare_models(
    texts: list[str],
    behavioral_X: np.ndarray,
    y: np.ndarray,
) -> dict:
    """
    Compare LogisticRegression, RandomForest, and SVC.
    Returns per-model metrics for diploma comparison table.
    """
    results = {}
    models: list[ModelType] = ["LogisticRegression", "RandomForest", "SVC"]

    for model_type in models:
        print(f"\n{'='*60}")
        print(f"  Model: {model_type}")
        print(f"{'='*60}")

        clf = SklearnClassifier(model_type=model_type)
        clf.fit(texts, behavioral_X, y)

        X_combined = clf._build_features(texts, behavioral_X, fit=False)

        # Cross-validation
        n_classes = len(set(y))
        n_folds = min(5, min((y == c).sum() for c in set(y)))
        if n_folds < 2:
            n_folds = 2

        skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
        cv_f1 = cross_val_score(clf.model, X_combined, y, cv=skf, scoring="f1_macro")
        cv_acc = cross_val_score(clf.model, X_combined, y, cv=skf, scoring="accuracy")

        # Full train predictions (for comparison table)
        y_pred = clf.model.predict(X_combined)
        acc = accuracy_score(y, y_pred)
        f1 = f1_score(y, y_pred, average="macro", zero_division=0)
        cm = confusion_matrix(y, y_pred, labels=[1, 2, 3])
        report = classification_report(
            y, y_pred, labels=[1, 2, 3],
            target_names=["L1 Novice", "L2 Intermediate", "L3 Expert"],
            zero_division=0,
        )

        print(f"  Train Accuracy: {acc:.4f}")
        print(f"  Train F1 macro: {f1:.4f}")
        print(f"  CV Accuracy:    {cv_acc.mean():.4f} ± {cv_acc.std():.4f}")
        print(f"  CV F1 macro:    {cv_f1.mean():.4f} ± {cv_f1.std():.4f}")
        print(f"\n  Confusion Matrix:")
        print(f"  {cm.tolist()}")
        print(f"\n  Classification Report:\n{report}")

        results[model_type] = {
            "train_accuracy": round(float(acc), 4),
            "train_f1": round(float(f1), 4),
            "cv_accuracy_mean": round(float(cv_acc.mean()), 4),
            "cv_accuracy_std": round(float(cv_acc.std()), 4),
            "cv_f1_mean": round(float(cv_f1.mean()), 4),
            "cv_f1_std": round(float(cv_f1.std()), 4),
            "confusion_matrix": cm.tolist(),
        }

    return results


def ablation_study(
    texts: list[str],
    behavioral_X: np.ndarray,
    y: np.ndarray,
) -> dict:
    """
    Ablation study: measure feature importance by:
    1. RandomForest feature_importances_
    2. Drop-one-feature analysis (drop each feature group, measure F1 drop)

    Returns importance data for diploma graphs.
    """
    print(f"\n{'='*60}")
    print("  ABLATION STUDY — Feature Importance")
    print(f"{'='*60}")

    # Method 1: RandomForest feature importances
    clf = SklearnClassifier(model_type="RandomForest")
    clf.fit(texts, behavioral_X, y)

    rf_model = clf.model
    importances = rf_model.feature_importances_

    # Get feature names: TF-IDF features + behavioral features
    tfidf_names = [f"tfidf:{w}" for w in clf.tfidf.get_feature_names_out()]
    all_names = tfidf_names + list(BEHAVIORAL_FEATURE_NAMES)

    # Sort by importance
    sorted_idx = np.argsort(importances)[::-1]

    print("\n  Top 20 features by RandomForest importance:")
    print(f"  {'Rank':<5} {'Feature':<40} {'Importance':<12}")
    print(f"  {'-'*57}")
    for rank, idx in enumerate(sorted_idx[:20], 1):
        print(f"  {rank:<5} {all_names[idx]:<40} {importances[idx]:.4f}")

    # Aggregate: total TF-IDF importance vs behavioral
    n_tfidf = len(tfidf_names)
    tfidf_total = importances[:n_tfidf].sum()
    behavioral_total = importances[n_tfidf:].sum()
    print(f"\n  TF-IDF features total importance:     {tfidf_total:.4f} ({tfidf_total / importances.sum() * 100:.1f}%)")
    print(f"  Behavioral features total importance:  {behavioral_total:.4f} ({behavioral_total / importances.sum() * 100:.1f}%)")

    # Per behavioral feature importance
    print(f"\n  Behavioral feature breakdown:")
    for i, name in enumerate(BEHAVIORAL_FEATURE_NAMES):
        imp = importances[n_tfidf + i]
        print(f"    {name:<35} {imp:.4f}")

    # Method 2: Drop-one analysis
    print(f"\n  Drop-one-feature analysis (baseline F1 vs F1 without feature group):")

    # Baseline: all features
    X_full = clf._build_features(texts, behavioral_X, fit=False)
    n_folds = min(5, min((y == c).sum() for c in set(y)))
    if n_folds < 2:
        n_folds = 2
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
    baseline_f1 = cross_val_score(rf_model, X_full, y, cv=skf, scoring="f1_macro").mean()
    print(f"  Baseline F1 (all features): {baseline_f1:.4f}")

    # Drop TF-IDF entirely (behavioral only)
    from sklearn.preprocessing import StandardScaler
    from sklearn.ensemble import RandomForestClassifier

    scaler = StandardScaler()
    X_beh_only = scaler.fit_transform(behavioral_X)
    rf_beh = RandomForestClassifier(n_estimators=100, max_depth=10, class_weight="balanced", random_state=42)
    rf_beh.fit(X_beh_only, y)
    f1_no_tfidf = cross_val_score(rf_beh, X_beh_only, y, cv=skf, scoring="f1_macro").mean()
    print(f"  Without TF-IDF:             {f1_no_tfidf:.4f}  (delta = {baseline_f1 - f1_no_tfidf:+.4f})")

    # Drop each behavioral feature
    drop_results = {}
    for i, name in enumerate(BEHAVIORAL_FEATURE_NAMES):
        X_dropped = np.delete(behavioral_X, i, axis=1)
        X_dropped_scaled = scaler.fit_transform(X_dropped)
        rf_drop = RandomForestClassifier(n_estimators=100, max_depth=10, class_weight="balanced", random_state=42)
        rf_drop.fit(X_dropped_scaled, y)
        f1_drop = cross_val_score(rf_drop, X_dropped_scaled, y, cv=skf, scoring="f1_macro").mean()
        delta = baseline_f1 - f1_drop
        drop_results[name] = {"f1_without": round(float(f1_drop), 4), "delta": round(float(delta), 4)}
        print(f"  Without {name:<30} F1={f1_drop:.4f}  (delta = {delta:+.4f})")

    return {
        "feature_importances": {all_names[i]: round(float(importances[i]), 4) for i in sorted_idx[:30]},
        "tfidf_total_importance": round(float(tfidf_total), 4),
        "behavioral_total_importance": round(float(behavioral_total), 4),
        "behavioral_importances": {name: round(float(importances[n_tfidf + i]), 4) for i, name in enumerate(BEHAVIORAL_FEATURE_NAMES)},
        "baseline_f1": round(float(baseline_f1), 4),
        "f1_without_tfidf": round(float(f1_no_tfidf), 4),
        "drop_one_results": drop_results,
    }


def random_baseline(y: np.ndarray) -> dict:
    """Random and majority baselines for comparison."""
    print(f"\n{'='*60}")
    print("  BASELINES")
    print(f"{'='*60}")

    # Random baseline
    rng = np.random.RandomState(42)
    y_random = rng.choice([1, 2, 3], size=len(y))
    random_acc = accuracy_score(y, y_random)
    random_f1 = f1_score(y, y_random, average="macro", zero_division=0)

    # Majority baseline
    from collections import Counter
    majority = Counter(y).most_common(1)[0][0]
    y_majority = np.full_like(y, majority)
    majority_acc = accuracy_score(y, y_majority)
    majority_f1 = f1_score(y, y_majority, average="macro", zero_division=0)

    print(f"  Random:   Accuracy={random_acc:.4f}, F1={random_f1:.4f}")
    print(f"  Majority: Accuracy={majority_acc:.4f}, F1={majority_f1:.4f} (class={majority})")

    return {
        "random": {"accuracy": round(float(random_acc), 4), "f1": round(float(random_f1), 4)},
        "majority": {"accuracy": round(float(majority_acc), 4), "f1": round(float(majority_f1), 4), "class": int(majority)},
    }


async def full_evaluation():
    """Run complete evaluation suite for diploma."""
    texts, behavioral_X, y, weights, stats = await _load_all_data()

    print(f"\nTotal samples: {len(y)}")
    for lvl in (1, 2, 3):
        count = int((y == lvl).sum())
        print(f"  L{lvl}: {count} ({count / len(y) * 100:.1f}%)")

    # 1. Baselines
    baselines = random_baseline(y)

    # 2. Model comparison
    model_results = compare_models(texts, behavioral_X, y)

    # 3. Ablation study
    ablation = ablation_study(texts, behavioral_X, y)

    # Save all results to JSON for later use in thesis
    all_results = {
        "n_samples": len(y),
        "dataset_tiers": stats,
        "class_distribution": {int(lvl): int((y == lvl).sum()) for lvl in (1, 2, 3)},
        "baselines": baselines,
        "model_comparison": model_results,
        "ablation_study": ablation,
    }

    with open("ml_evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print("  Results saved to ml_evaluation_results.json")
    print(f"{'='*60}")

    return all_results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ML Evaluation for Diploma")
    parser.add_argument("--ablation", action="store_true", help="Run ablation study only")
    parser.add_argument("--compare-models", action="store_true", help="Compare models only")
    args = parser.parse_args()

    async def main():
        texts, behavioral_X, y, weights, stats = await _load_all_data()
        print(f"Loaded {len(y)} samples")

        if args.ablation:
            ablation_study(texts, behavioral_X, y)
        elif args.compare_models:
            compare_models(texts, behavioral_X, y)
        else:
            await full_evaluation()

    asyncio.run(main())