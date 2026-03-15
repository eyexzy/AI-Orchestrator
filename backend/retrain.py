import sys
import json
import asyncio
import argparse

import numpy as np
from sqlalchemy import select

from database import AsyncSessionLocal, init_db, MLFeedback, MLModelCache
from ml_classifier import SimpleLogisticClassifier


async def retrain_from_db(min_samples: int = 10):
    await init_db()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MLFeedback))
        rows = result.scalars().all()

    print(f"[retrain] Loaded {len(rows)} valid samples from database")

    if len(rows) < min_samples:
        print(f"[retrain] Not enough data ({len(rows)} < {min_samples}). Aborting.")
        sys.exit(1)

    X = np.array([
        [r.prompt_length, r.word_count, r.tech_term_count, r.has_structure,
         r.chars_per_second, r.session_message_count, r.avg_prompt_length,
         r.used_advanced_features_count, r.tooltip_click_count]
        for r in rows
    ], dtype=float)
    y = np.array([r.actual_level for r in rows])

    # Class distribution
    for lvl in (1, 2, 3):
        count = int((y == lvl).sum())
        print(f"[retrain]   L{lvl}: {count} samples ({count/len(y)*100:.1f}%)")

    clf = SimpleLogisticClassifier()
    clf.fit(X, y, lr=0.01, epochs=1000)

    # Quick accuracy check on training data
    correct = sum(
        1 for xi, yi in zip(X, y)
        if clf.predict(xi.reshape(1, -1)) == yi
    )
    print(f"[retrain] Train accuracy: {correct}/{len(X)} = {correct/len(X)*100:.1f}%")

    # Persist to DB
    weights_json = json.dumps(clf.to_dict())
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(MLModelCache).where(MLModelCache.id == 1))
        cache_row = existing.scalar_one_or_none()
        if cache_row:
            cache_row.weights_json = weights_json
        else:
            db.add(MLModelCache(id=1, weights_json=weights_json))
        await db.commit()

    print("[retrain] Model saved to database")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-samples", type=int, default=10)
    args = parser.parse_args()
    asyncio.run(retrain_from_db(args.min_samples))