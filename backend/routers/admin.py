import csv
import io
import json
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

import ml_classifier
from database import AdaptationDecision, AdaptationFeedback, InteractionLog, MLFeedback, MLModelCache, UserExperienceProfile
from dependencies import check_admin_key, get_db, limiter
from schemas.api import RetrainResponse
from services.cache import cache
from services.llm import clients, AVAILABLE_MODELS
from services.scoring import has_structured_patterns
from retrain import retrain_from_db

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()

MODELS_CACHE_KEY = "public:models"
MODELS_CACHE_TTL_SECONDS = 60
ADMIN_STATS_CACHE_KEY = "admin:stats"
ADMIN_ML_STATS_CACHE_KEY = "admin:stats:ml"
ADMIN_STATS_CACHE_TTL_SECONDS = 30


async def _invalidate_admin_stats_cache() -> None:
    await cache.delete_many([ADMIN_STATS_CACHE_KEY, ADMIN_ML_STATS_CACHE_KEY])

# Health & models

@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {
        "status":           "ok",
        "version":          "0.9.0",
        "db":               db_status,
        "providers":        {name: True for name in clients},
        "available_models": len(AVAILABLE_MODELS),
    }


@router.get("/models")
async def list_models():
    async def build_models_payload():
        result = {}
        for model_id, info in AVAILABLE_MODELS.items():
            provider = info["provider"]
            available = provider in clients
            result[model_id] = {**info, "available": available}
        return {"models": result, "cache_backend": cache.backend_name}

    return await cache.get_or_set_json(
        MODELS_CACHE_KEY,
        MODELS_CACHE_TTL_SECONDS,
        build_models_payload,
    )


# Provider test

@limiter.limit("5/minute")
@router.get("/test-providers", dependencies=[Depends(check_admin_key)])
async def test_providers(request: Request):
    results       = {}
    test_messages = [{"role": "user", "content": "Say 'OK' in one word."}]
    for name, client in clients.items():
        test_model = None
        for mid, info in AVAILABLE_MODELS.items():
            if info["provider"] == name:
                test_model = info["api_name"]
                break
        if not test_model:
            results[name] = {"status": "no_model"}
            continue
        try:
            start  = time.time()
            resp   = await client.chat.completions.create(model=test_model, messages=test_messages, max_tokens=10, temperature=0)
            latency = int((time.time() - start) * 1000)
            text   = resp.choices[0].message.content or ""
            results[name] = {"status": "ok", "model": test_model, "response": text[:50], "latency_ms": latency}
        except Exception as e:
            logger.error(f"[test-providers] {name} failed: {type(e).__name__}: {e}")
            results[name] = {"status": "error", "model": test_model, "error": "Provider test failed"}
    return {"providers": results}


@router.post("/ml/retrain", response_model=RetrainResponse, dependencies=[Depends(check_admin_key)])
async def ml_retrain(
    request: Request,
    model_type: str = Query(default="LogisticRegression", pattern="^(LogisticRegression|RandomForest|SVC)$"),
    min_samples: int = Query(default=10, ge=0),
    use_tuning: bool = Query(default=True),
):
    """Retrain the ML classifier with optional tuning for supported models."""
    try:
        eval_result = await retrain_from_db(
            min_samples=min_samples,
            model_type=model_type,
            use_tuning=use_tuning,
        )
        # Hot-reload already done inside retrain_from_db — just invalidate cache.
        await _invalidate_admin_stats_cache()

        return RetrainResponse(
            ok=True,
            message=f"Model retrained ({model_type}) on {eval_result['samples_total']} samples",
            samples_used=eval_result["samples_total"],
            train_accuracy=eval_result["accuracy"],
            test_accuracy=eval_result["accuracy"],
            f1_macro=eval_result["f1_macro"],
            cv_f1_mean=eval_result["cv_f1_mean"],
            cv_f1_std=eval_result["cv_f1_std"],
            model_type=model_type,
            model_params=eval_result.get("model_params", {}),
            tuning=eval_result.get("tuning"),
            confusion_matrix=eval_result["confusion_matrix"],
            classification_report=eval_result["classification_report"],
        )

    except Exception as e:
        logger.error(f"[retrain] Retrain failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/dataset/stats", dependencies=[Depends(check_admin_key)])
async def dataset_stats(db: AsyncSession = Depends(get_db)):
    """Return training dataset statistics with quality assessment."""
    SILVER_CONF_THRESHOLD = 0.6
    SYNTHETIC_COUNT = 60  # matches _create_synthetic_training_data()
    TARGET_TEST_USERS = 100
    TARGET_GOLD_SAMPLES = 200
    TARGET_SILVER_SAMPLES = 1000
    TARGET_BRONZE_SAMPLES = 100
    TARGET_REAL_SAMPLES = 1000

    gold_r = await db.execute(select(func.count(AdaptationFeedback.id)))
    gold_count = gold_r.scalar() or 0

    silver_r = await db.execute(
        select(func.count(AdaptationDecision.id))
        .where(AdaptationDecision.confidence >= SILVER_CONF_THRESHOLD)
    )
    silver_count = silver_r.scalar() or 0

    bronze_r = await db.execute(select(func.count(MLFeedback.id)))
    bronze_count = bronze_r.scalar() or 0

    # Gold distribution by level
    dist_r = await db.execute(
        select(AdaptationFeedback.ui_level_at_time, func.count(AdaptationFeedback.id))
        .where(AdaptationFeedback.ui_level_at_time.in_([1, 2, 3]))
        .group_by(AdaptationFeedback.ui_level_at_time)
    )
    gold_dist = {str(row[0]): row[1] for row in dist_r.all()}

    real_total = gold_count + silver_count + bronze_count
    # Synthetic is added when: total too low OR any class has 0 samples
    has_missing_class = any(gold_dist.get(str(l), 0) == 0 for l in [1, 2, 3])
    will_use_synthetic = real_total < TARGET_REAL_SAMPLES or has_missing_class

    issues: list[str] = []
    if gold_count < TARGET_GOLD_SAMPLES:
        issues.append(f"Золоті приклади: {gold_count}/{TARGET_GOLD_SAMPLES} - потрібно більше явного фідбеку")
    if real_total < TARGET_REAL_SAMPLES:
        issues.append(f"Реальні приклади: {real_total}/{TARGET_REAL_SAMPLES} - ціль розрахована на 100 тестерів")
    if gold_dist:
        counts = [gold_dist.get(str(l), 0) for l in [1, 2, 3]]
        missing = [f"L{l}" for l in [1, 2, 3] if gold_dist.get(str(l), 0) == 0]
        if missing:
            issues.append(f"Немає золотих прикладів для {', '.join(missing)}")
        elif max(counts) > 0 and min(counts) > 0 and max(counts) / min(counts) > 3:
            issues.append("Дисбаланс класів у золотих мітках (>3x різниця між рівнями)")

    recommendation = "ready" if gold_count >= TARGET_GOLD_SAMPLES and real_total >= TARGET_REAL_SAMPLES and not any("Дисбаланс" in i or "Немає золотих" in i for i in issues) else "collect_more"

    return {
        "gold": gold_count,
        "silver": silver_count,
        "bronze": bronze_count,
        "synthetic": SYNTHETIC_COUNT,
        "real_total": real_total,
        "will_use_synthetic": will_use_synthetic,
        "gold_distribution": gold_dist,
        "issues": issues,
        "recommendation": recommendation,
        "target_test_users": TARGET_TEST_USERS,
        "target_gold_samples": TARGET_GOLD_SAMPLES,
        "target_silver_samples": TARGET_SILVER_SAMPLES,
        "target_bronze_samples": TARGET_BRONZE_SAMPLES,
        "target_real_samples": TARGET_REAL_SAMPLES,
        "min_gold_recommended": TARGET_GOLD_SAMPLES,
        "min_real_recommended": TARGET_REAL_SAMPLES,
    }


# Export / stats

@router.get("/export-csv", dependencies=[Depends(check_admin_key)])
async def export_csv(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InteractionLog).order_by(InteractionLog.timestamp.asc())
    )
    logs = result.scalars().all()
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["Timestamp", "SessionID", "ChatID", "UserEmail", "Level", "Prompt", "Score", "NormalizedScore", "TypingSpeed", "Metrics"],
    )
    writer.writeheader()
    for log in logs:
        writer.writerow(log.to_csv_row())
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=interaction_logs.csv"},
    )


@router.get("/stats", dependencies=[Depends(check_admin_key)])
async def stats(db: AsyncSession = Depends(get_db)):
    async def build_stats_payload():
        result = await db.execute(select(func.count(InteractionLog.id)))
        total = result.scalar() or 0
        return {
            "total_interactions": total,
            "cache_backend": cache.backend_name,
        }

    return await cache.get_or_set_json(
        ADMIN_STATS_CACHE_KEY,
        ADMIN_STATS_CACHE_TTL_SECONDS,
        build_stats_payload,
    )


@router.get("/stats/ml", dependencies=[Depends(check_admin_key)])
async def ml_stats(db: AsyncSession = Depends(get_db)):
    async def build_ml_stats_payload():
        model_meta = {}
        model_row = await db.execute(
            select(MLModelCache)
            .order_by(MLModelCache.updated_at.desc(), MLModelCache.id.desc())
            .limit(1)
        )
        cached = model_row.scalars().first()
        if cached:
            model_meta = {
                "model_type": cached.model_type or "LogisticRegression",
                "accuracy": cached.accuracy or 0.0,
                "f1_score": cached.f1_score or 0.0,
                "samples_used": cached.samples_used or 0,
                "updated_at": cached.updated_at.isoformat() if cached.updated_at else None,
                "classification_report": json.loads(cached.classification_report_json or "{}"),
            }

        fb_result = await db.execute(select(func.count(MLFeedback.id)))
        feedback_count = fb_result.scalar() or 0

        result = await db.execute(
            select(InteractionLog).order_by(InteractionLog.timestamp.asc())
        )
        logs = result.scalars().all()
        if not logs:
            return {
                "total": 0,
                "feedback_samples": feedback_count,
                "level_distribution": {1: 0, 2: 0, 3: 0},
                "avg_score_by_level": {1: 0.0, 2: 0.0, 3: 0.0},
                "avg_normalized_by_level": {1: 0.0, 2: 0.0, 3: 0.0},
                "confusion_matrix": [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                "ml_accuracy": 0.0,
                "model_info": model_meta,
                "cache_backend": cache.backend_name,
            }

        level_dist = {1: 0, 2: 0, 3: 0}
        score_by_level = {1: [], 2: [], 3: []}
        norm_by_level = {1: [], 2: [], 3: []}
        confusion = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        ml_correct = 0
        actual_levels: list[int] = []
        prompt_texts: list[str] = []
        metrics_list: list[dict] = []

        for log in logs:
            lvl = max(1, min(3, log.user_level))
            actual_levels.append(lvl)
            level_dist[lvl] += 1
            score_by_level[lvl].append(log.score_awarded or 0)
            norm_by_level[lvl].append(log.normalized_score or 0)
            try:
                metrics_dict = json.loads(log.metrics_json or "{}")
                if not isinstance(metrics_dict, dict):
                    metrics_dict = {}
            except (TypeError, json.JSONDecodeError):
                metrics_dict = {}
            prompt_texts.append(log.prompt_text or "")
            metrics_list.append(metrics_dict)

        ml_predictions = ml_classifier.ml_predict_batch(
            prompt_texts,
            metrics_list,
            has_structured_patterns,
        )
        if len(ml_predictions) < len(actual_levels):
            ml_predictions.extend([(1, 0.0)] * (len(actual_levels) - len(ml_predictions)))

        for actual_level, (ml_level, _) in zip(actual_levels, ml_predictions):
            ml_level = max(1, min(3, ml_level))
            confusion[actual_level - 1][ml_level - 1] += 1
            if ml_level == actual_level:
                ml_correct += 1

        return {
            "total": len(logs),
            "feedback_samples": feedback_count,
            "level_distribution": level_dist,
            "avg_score_by_level": {k: round(sum(v) / len(v), 3) if v else 0.0 for k, v in score_by_level.items()},
            "avg_normalized_by_level": {k: round(sum(v) / len(v), 3) if v else 0.0 for k, v in norm_by_level.items()},
            "confusion_matrix": confusion,
            "ml_accuracy": round(ml_correct / len(logs), 3) if logs else 0.0,
            "model_info": model_meta,
            "note": "confusion_matrix[actual_level-1][ml_predicted_level-1]",
            "cache_backend": cache.backend_name,
        }

    return await cache.get_or_set_json(
        ADMIN_ML_STATS_CACHE_KEY,
        ADMIN_STATS_CACHE_TTL_SECONDS,
        build_ml_stats_payload,
    )


# ── Users monitoring ────────────────────────────────────────────────────────

@router.get("/users/stats", dependencies=[Depends(check_admin_key)])
async def users_stats(db: AsyncSession = Depends(get_db)):
    """Active-user counts and level distribution across all users."""
    from datetime import datetime, timezone, timedelta

    now = datetime.now(timezone.utc)
    hour_ago = now - timedelta(hours=1)
    day_ago  = now - timedelta(hours=24)

    total_r = await db.execute(select(func.count(UserExperienceProfile.user_email)))
    total_users = total_r.scalar() or 0

    active_today_r = await db.execute(
        select(func.count(func.distinct(InteractionLog.user_email)))
        .where(InteractionLog.timestamp >= day_ago)
    )
    active_today = active_today_r.scalar() or 0

    active_hour_r = await db.execute(
        select(func.count(func.distinct(InteractionLog.user_email)))
        .where(InteractionLog.timestamp >= hour_ago)
    )
    active_hour = active_hour_r.scalar() or 0

    level_r = await db.execute(
        select(UserExperienceProfile.current_level, func.count(UserExperienceProfile.user_email))
        .group_by(UserExperienceProfile.current_level)
    )
    level_dist = {str(row[0]): row[1] for row in level_r.all() if row[0] in (1, 2, 3)}

    return {
        "total_users": total_users,
        "active_today": active_today,
        "active_last_hour": active_hour,
        "level_distribution": level_dist,
    }


@router.get("/users/list", dependencies=[Depends(check_admin_key)])
async def users_list(db: AsyncSession = Depends(get_db)):
    """All users with their current level, activity, and behavioral metrics."""
    stats_sub = (
        select(
            InteractionLog.user_email,
            func.count(InteractionLog.id).label("interaction_count"),
            func.max(InteractionLog.timestamp).label("last_active"),
        )
        .group_by(InteractionLog.user_email)
        .subquery()
    )

    result = await db.execute(
        select(
            UserExperienceProfile.user_email,
            UserExperienceProfile.current_level,
            UserExperienceProfile.confidence_last,
            UserExperienceProfile.profile_features_json,
            stats_sub.c.interaction_count,
            stats_sub.c.last_active,
        )
        .outerjoin(stats_sub, UserExperienceProfile.user_email == stats_sub.c.user_email)
        .order_by(stats_sub.c.last_active.desc().nullslast())
    )

    users = []
    for row in result.all():
        features: dict = {}
        try:
            features = json.loads(row.profile_features_json or "{}")
        except Exception:
            pass
        users.append({
            "email": row.user_email,
            "current_level": row.current_level or 1,
            "confidence": round(float(row.confidence_last or 0), 2),
            "interaction_count": row.interaction_count or 0,
            "sessions_count": int(features.get("sessions_count", 0)),
            "last_active": row.last_active.isoformat() if row.last_active else None,
            "help_ratio": round(float(features.get("help_ratio", 0)), 2),
            "avg_prompt_length": int(features.get("avg_prompt_length_rolling", 0)),
        })

    return {"users": users, "total": len(users)}


@router.get("/users/issues", dependencies=[Depends(check_admin_key)])
async def users_issues(db: AsyncSession = Depends(get_db)):
    """Heuristic adaptation issues that need admin attention."""
    stats_sub = (
        select(
            InteractionLog.user_email,
            func.count(InteractionLog.id).label("interaction_count"),
            func.max(InteractionLog.timestamp).label("last_active"),
        )
        .group_by(InteractionLog.user_email)
        .subquery()
    )

    result = await db.execute(
        select(
            UserExperienceProfile.user_email,
            UserExperienceProfile.current_level,
            UserExperienceProfile.confidence_last,
            UserExperienceProfile.profile_features_json,
            stats_sub.c.interaction_count,
            stats_sub.c.last_active,
        )
        .outerjoin(stats_sub, UserExperienceProfile.user_email == stats_sub.c.user_email)
        .order_by(stats_sub.c.last_active.desc().nullslast())
    )

    issues = []
    for row in result.all():
        try:
            features = json.loads(row.profile_features_json or "{}")
            if not isinstance(features, dict):
                features = {}
        except Exception:
            features = {}

        email = row.user_email
        level = int(row.current_level or 1)
        confidence = float(row.confidence_last or 0)
        interactions = int(row.interaction_count or 0)
        help_ratio = float(features.get("help_ratio", 0) or 0)
        avg_prompt_length = float(features.get("avg_prompt_length_rolling", 0) or 0)

        if interactions >= 15 and level < 3 and confidence < 0.3:
            issues.append({
                "email": email,
                "severity": "warning",
                "code": "stuck_level",
                "title": f"Застряг на L{level}",
                "detail": f"{interactions} промптів, впевненість {confidence:.2f}",
                "last_active": row.last_active.isoformat() if row.last_active else None,
            })

        if interactions >= 5 and help_ratio >= 0.7:
            issues.append({
                "email": email,
                "severity": "warning",
                "code": "high_help_ratio",
                "title": "Висока частка допомоги",
                "detail": f"Частка допомоги {help_ratio:.2f}; користувач може не знаходити функції",
                "last_active": row.last_active.isoformat() if row.last_active else None,
            })

        if interactions >= 8 and avg_prompt_length < 20 and level >= 2:
            issues.append({
                "email": email,
                "severity": "info",
                "code": "short_prompts",
                "title": "Короткі промпти для поточного рівня",
                "detail": f"Середня довжина промпта {avg_prompt_length:.0f} символів на L{level}",
                "last_active": row.last_active.isoformat() if row.last_active else None,
            })

    severity_rank = {"warning": 0, "info": 1}
    issues.sort(key=lambda item: (severity_rank.get(item["severity"], 9), item["email"]))
    return {"issues": issues[:30], "total": len(issues)}


@router.get("/activity/hourly", dependencies=[Depends(check_admin_key)])
async def hourly_activity(db: AsyncSession = Depends(get_db)):
    """Interaction counts per hour for the last 24 hours."""
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict

    now     = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)

    result = await db.execute(
        select(InteractionLog.timestamp)
        .where(InteractionLog.timestamp >= day_ago)
        .order_by(InteractionLog.timestamp)
    )
    timestamps = [row[0] for row in result.all() if row[0]]

    hourly: dict[str, int] = defaultdict(int)
    for ts in timestamps:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        hourly[ts.strftime("%Y-%m-%dT%H:00")] += 1

    hours_data = []
    for h in range(24):
        t = (now - timedelta(hours=23 - h)).replace(minute=0, second=0, microsecond=0)
        hours_data.append({
            "label": t.strftime("%H:00"),
            "count": hourly.get(t.strftime("%Y-%m-%dT%H:00"), 0),
        })

    return {"hours": hours_data, "total": len(timestamps)}

