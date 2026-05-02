"""
Dataset builder for ML retraining pipeline.

Assembles training samples from multiple sources with quality tiers:
  - gold:   explicit user labels (adaptation_feedback)
  - silver: high-confidence adaptation decisions (confidence >= threshold)
  - bronze: legacy MLFeedback rows (post mood-fix) + synthetic fallback

Each sample is: (prompt_text, behavioral_features, label, tier, weight).
Gold samples get weight=1.0, silver=0.6, bronze=0.3.
"""

import json
import logging
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    AdaptationFeedback,
    AdaptationDecision,
    InteractionLog,
    MLFeedback,
    AsyncSessionLocal,
    init_db,
)
from ml_classifier import extract_behavioral_features, _create_synthetic_training_data

logger = logging.getLogger("ml-classifier")

# Configuration

SILVER_CONFIDENCE_THRESHOLD = 0.6
GOLD_WEIGHT = 1.0
SILVER_WEIGHT = 0.6
BRONZE_WEIGHT = 0.3


@dataclass
class LabeledSample:
    prompt_text: str
    behavioral_features: np.ndarray  # shape (8,)
    label: int  # 1, 2, or 3
    tier: str  # "gold", "silver", "bronze", "synthetic"
    weight: float


def _valid_level(value: object) -> int | None:
    return int(value) if value in (1, 2, 3, "1", "2", "3") else None


def _auto_label_from_feedback(row: AdaptationFeedback, snapshot: dict) -> int | None:
    """Resolve feedback to the real Auto/user level, not forced UI."""
    manual_active = bool(snapshot.get("manual_override_active"))
    base_level = _valid_level(snapshot.get("auto_level_at_time"))
    if base_level is None and not manual_active:
        base_level = _valid_level(row.ui_level_at_time)
    answer = row.answer_value

    if row.question_type == "self_assess_level":
        direct_level = _valid_level(answer)
        if direct_level is not None:
            return direct_level
        if base_level is None:
            return None
        if answer == "more_guidance":
            return max(1, base_level - 1)
        if answer == "current_guidance_fits":
            return base_level
        if answer == "less_guidance":
            return min(3, base_level + 1)
        return None

    if base_level is None:
        return None

    if row.question_type in ("level_change_agreement", "periodic_level_check"):
        if answer in ("agree", "current_layout_fits"):
            return base_level
        if answer == "simpler_layout":
            return max(1, base_level - 1)
        if answer == "more_control_needed":
            return min(3, base_level + 1)
        return None
    if row.question_type == "scenario_satisfaction":
        if answer in ("just_right", "improved", "no_change"):
            return base_level
        if answer == "too_easy":
            return min(3, base_level + 1)
        if answer in ("too_hard", "less_clear"):
            return max(1, base_level - 1)
        return None
    if row.question_type == "help_series_check":
        if answer in ("fine", "just_exploring", "learning_feature", "looking_for_shortcut"):
            return base_level
        if answer in ("too_complex", "interface_unclear"):
            return max(1, base_level - 1)
        return None
    return None


def _auto_label_from_decision(decision: AdaptationDecision) -> int | None:
    """Use high-confidence Auto decisions as silver labels, never forced UI."""
    try:
        transition = json.loads(decision.transition_reason_json or "{}")
    except (json.JSONDecodeError, TypeError):
        transition = {}
    return _valid_level(transition.get("auto_level")) or _valid_level(decision.final_level)


# Gold: explicit adaptation feedback

async def _build_gold_samples(db: AsyncSession) -> list[LabeledSample]:
    """Extract gold labels from adaptation_feedback table.

    Supported question types:
    - self_assess_level: answer_value is "1", "2", or "3"
    - level_change_agreement: "agree" → ui_level_at_time is correct
    - periodic_level_check: "agree" → ui_level_at_time is correct
    - scenario_satisfaction: "too_easy" → label+1, "too_hard" → label-1, "just_right" → keep
    - help_series_check: "too_complex" → label-1, "fine"/"just_exploring" → keep
    """
    result = await db.execute(select(AdaptationFeedback))
    rows = result.scalars().all()

    samples: list[LabeledSample] = []
    for row in rows:
        snapshot = {}
        try:
            snapshot = json.loads(row.feature_snapshot_json or "{}")
        except (json.JSONDecodeError, TypeError):
            pass

        label = _auto_label_from_feedback(row, snapshot)
        qt = row.question_type
        av = row.answer_value

        if qt == "self_assess_level" and av in ("1", "2", "3"):
            label = int(av)
        elif qt in ("level_change_agreement", "periodic_level_check"):
            if av == "agree" and row.ui_level_at_time in (1, 2, 3):
                label = row.ui_level_at_time
            elif av == "disagree":
                # User disagrees — we don't know the true label, skip
                continue
        elif qt == "scenario_satisfaction":
            if row.ui_level_at_time in (1, 2, 3):
                if av == "just_right":
                    label = row.ui_level_at_time
                elif av == "too_easy":
                    label = min(3, row.ui_level_at_time + 1)
                elif av == "too_hard":
                    label = max(1, row.ui_level_at_time - 1)
        elif qt == "help_series_check":
            if row.ui_level_at_time in (1, 2, 3):
                if av in ("fine", "just_exploring"):
                    label = row.ui_level_at_time
                elif av == "too_complex":
                    label = max(1, row.ui_level_at_time - 1)

        if label is None:
            continue

        # Try to get prompt text from the feature snapshot or a nearby interaction log
        snapshot = {}
        try:
            snapshot = json.loads(row.feature_snapshot_json or "{}")
        except (json.JSONDecodeError, TypeError):
            pass
        label = _auto_label_from_feedback(row, snapshot) or label

        # Look up the nearest interaction log for this session
        prompt_text = ""
        metrics = {}
        if row.session_id:
            il_stmt = (
                select(InteractionLog.prompt_text, InteractionLog.metrics_json)
                .where(
                    and_(
                        InteractionLog.session_id == row.session_id,
                        InteractionLog.user_email == row.user_email,
                    )
                )
                .order_by(InteractionLog.timestamp.desc())
                .limit(1)
            )
            il_result = await db.execute(il_stmt)
            il_row = il_result.first()
            if il_row:
                prompt_text = il_row[0] or ""
                try:
                    metrics = json.loads(il_row[1] or "{}")
                except (json.JSONDecodeError, TypeError):
                    metrics = {}

        if not prompt_text:
            continue  # Can't train without text

        # Prefer session metrics from interaction_logs; fall back to rolling snapshot.
        if not metrics:
            metrics = {
                "chars_per_second": 0,
                "session_message_count": snapshot.get("total_prompts", 0),
                "avg_prompt_length": snapshot.get("avg_prompt_length_rolling", 0),
                "used_advanced_features_count": snapshot.get("advanced_actions_total", 0),
                "tooltip_click_count": 0,
            }
        beh = extract_behavioral_features(prompt_text, metrics)

        samples.append(LabeledSample(
            prompt_text=prompt_text,
            behavioral_features=beh,
            label=label,
            tier="gold",
            weight=GOLD_WEIGHT,
        ))

    return samples


# Silver: high-confidence adaptation decisions

async def _build_silver_samples(
    db: AsyncSession,
    *,
    gold_session_ids: set[str],
) -> list[LabeledSample]:
    """Extract silver labels from adaptation_decisions with high confidence.

    Skip sessions that already have gold labels to avoid duplication.
    """
    stmt = (
        select(AdaptationDecision)
        .where(AdaptationDecision.confidence >= SILVER_CONFIDENCE_THRESHOLD)
        .order_by(AdaptationDecision.created_at.desc())
        .limit(500)
    )
    result = await db.execute(stmt)
    decisions = result.scalars().all()

    samples: list[LabeledSample] = []
    seen_sessions: set[str] = set()

    for d in decisions:
        sid = d.session_id or ""
        if sid in gold_session_ids or sid in seen_sessions:
            continue
        seen_sessions.add(sid)

        label = _auto_label_from_decision(d)
        if label not in (1, 2, 3):
            continue

        # Get latest prompt for this session
        if not sid:
            continue
        il_stmt = (
            select(InteractionLog.prompt_text, InteractionLog.metrics_json)
            .where(
                and_(
                    InteractionLog.session_id == sid,
                    InteractionLog.user_email == d.user_email,
                )
            )
            .order_by(InteractionLog.timestamp.desc())
            .limit(1)
        )
        il_result = await db.execute(il_stmt)
        il_row = il_result.first()
        if not il_row or not il_row[0]:
            continue

        prompt_text = il_row[0]
        metrics_json = il_row[1] or "{}"
        try:
            metrics = json.loads(metrics_json)
        except (json.JSONDecodeError, TypeError):
            metrics = {}

        beh = extract_behavioral_features(prompt_text, metrics)

        samples.append(LabeledSample(
            prompt_text=prompt_text,
            behavioral_features=beh,
            label=label,
            tier="silver",
            weight=SILVER_WEIGHT,
        ))

    return samples


# Bronze: legacy MLFeedback (post mood-fix only)

async def _build_bronze_samples(db: AsyncSession) -> list[LabeledSample]:
    """Load MLFeedback rows. These are legacy labels — lower trust."""
    result = await db.execute(select(MLFeedback))
    rows = result.scalars().all()

    samples: list[LabeledSample] = []
    for r in rows:
        if r.actual_level not in (1, 2, 3):
            continue
        prompt_text = r.prompt_text or ""
        if not prompt_text:
            continue

        beh = np.array([
            r.prompt_length, r.word_count, r.has_structure,
            r.chars_per_second, r.session_message_count, r.avg_prompt_length,
            r.used_advanced_features_count, r.tooltip_click_count,
        ], dtype=float)

        samples.append(LabeledSample(
            prompt_text=prompt_text,
            behavioral_features=beh,
            label=r.actual_level,
            tier="bronze",
            weight=BRONZE_WEIGHT,
        ))

    return samples


# Synthetic fallback

def _build_synthetic_samples() -> list[LabeledSample]:
    """Cold-start synthetic data."""
    texts, behavioral_X, y = _create_synthetic_training_data()
    return [
        LabeledSample(
            prompt_text=texts[i],
            behavioral_features=behavioral_X[i],
            label=int(y[i]),
            tier="synthetic",
            weight=BRONZE_WEIGHT,
        )
        for i in range(len(y))
    ]


# Public API

async def build_dataset(
    *,
    min_samples: int = 10,
    include_synthetic: bool = True,
) -> tuple[list[str], np.ndarray, np.ndarray, np.ndarray, dict]:
    """Build the full training dataset with quality tiers.

    Returns:
        texts: list of prompt texts
        behavioral_X: (N, 8) feature matrix
        y: (N,) label array
        sample_weights: (N,) weight array for sklearn sample_weight
        stats: dict with tier counts and metadata
    """
    await init_db()

    async with AsyncSessionLocal() as db:
        gold = await _build_gold_samples(db)
        # Dedup by session_id — skip silver sessions that already have a gold label
        fb_result = await db.execute(select(AdaptationFeedback.session_id))
        gold_sids = {r[0] for r in fb_result.all() if r[0]}

        silver = await _build_silver_samples(db, gold_session_ids=gold_sids)
        bronze = await _build_bronze_samples(db)

    all_samples = gold + silver + bronze

    # Add synthetic data if: too few total samples OR any class is missing entirely.
    # A missing class causes sklearn to crash with "only one class" error.
    real_class_counts = {1: 0, 2: 0, 3: 0}
    for s in all_samples:
        real_class_counts[s.label] = real_class_counts.get(s.label, 0) + 1
    has_missing_class = any(real_class_counts[lvl] == 0 for lvl in (1, 2, 3))

    if include_synthetic and (len(all_samples) < min_samples or has_missing_class):
        synthetic = _build_synthetic_samples()
        all_samples.extend(synthetic)

    if not all_samples:
        # Absolute fallback
        all_samples = _build_synthetic_samples()

    texts = [s.prompt_text for s in all_samples]
    behavioral_X = np.array([s.behavioral_features for s in all_samples], dtype=float)
    y = np.array([s.label for s in all_samples])
    sample_weights = np.array([s.weight for s in all_samples])

    stats = {
        "total": len(all_samples),
        "gold": sum(1 for s in all_samples if s.tier == "gold"),
        "silver": sum(1 for s in all_samples if s.tier == "silver"),
        "bronze": sum(1 for s in all_samples if s.tier == "bronze"),
        "synthetic": sum(1 for s in all_samples if s.tier == "synthetic"),
        "class_distribution": {
            int(lvl): int((y == lvl).sum()) for lvl in (1, 2, 3)
        },
    }

    logger.info(
        "[dataset] Built training dataset",
        extra=stats,
    )

    return texts, behavioral_X, y, sample_weights, stats
