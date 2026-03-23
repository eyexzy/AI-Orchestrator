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
from database import InteractionLog, MLFeedback, MLModelCache
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
        clf = eval_result["classifier"]
        ml_classifier._classifier.from_dict(clf.to_dict())
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
