"""
Retrain ML classifier on accumulated feedback data.
Run manually after collecting enough real user data:
  python retrain.py
  python retrain.py --csv ml_feedback.csv --min-samples 15
"""
import csv
import sys
import argparse
import numpy as np
from pathlib import Path


def retrain_from_feedback(csv_path: str = "ml_feedback.csv", min_samples: int = 10):
    path = Path(csv_path)
    if not path.exists():
        print(f"[retrain] File not found: {csv_path}")
        sys.exit(1)

    X, y = [], []
    feature_cols = [
        "prompt_length", "word_count", "tech_term_count",
        "has_structure", "chars_per_second", "session_message_count",
        "avg_prompt_length", "used_advanced_features_count", "tooltip_click_count",
    ]

    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            try:
                features = [float(row[col]) for col in feature_cols]
                label = int(row["actual_level"])
                if label not in (1, 2, 3):
                    print(f"[retrain] Skipping row {i}: invalid label {label}")
                    continue
                X.append(features)
                y.append(label)
            except (KeyError, ValueError) as e:
                print(f"[retrain] Skipping row {i}: {e}")

    print(f"[retrain] Loaded {len(X)} valid samples")

    if len(X) < min_samples:
        print(f"[retrain] Not enough data ({len(X)} < {min_samples}). Aborting.")
        sys.exit(1)

    # Class distribution
    for lvl in (1, 2, 3):
        count = sum(1 for l in y if l == lvl)
        print(f"[retrain]   L{lvl}: {count} samples ({count/len(y)*100:.1f}%)")

    from ml_classifier import SimpleLogisticClassifier, MODEL_PATH
    clf = SimpleLogisticClassifier()
    clf.fit(np.array(X), np.array(y), lr=0.01, epochs=1000)
    clf.save(MODEL_PATH)
    print(f"[retrain] ✅ Model saved to {MODEL_PATH}")

    # Quick accuracy check on training data
    correct = sum(
        1 for xi, yi in zip(X, y)
        if clf.predict(np.array(xi).reshape(1, -1)) == yi
    )
    print(f"[retrain] Train accuracy: {correct}/{len(X)} = {correct/len(X)*100:.1f}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="ml_feedback.csv")
    parser.add_argument("--min-samples", type=int, default=10)
    args = parser.parse_args()
    retrain_from_feedback(args.csv, args.min_samples)
