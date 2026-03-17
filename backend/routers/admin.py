import csv
import io
import json
import logging
import time
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import ml_classifier
from ml_classifier import FEATURE_NAMES, extract_behavioral_features
from database import InteractionLog, MLFeedback, MLModelCache
from dependencies import limiter, check_admin_key, get_db
from schemas.api import TrainingFeedback, RetrainResponse
from services.llm import clients, AVAILABLE_MODELS
from services.scoring import count_technical_terms, has_structured_patterns
from retrain import train_and_evaluate, _load_data_from_rows

logger = logging.getLogger("ai-orchestrator")

router = APIRouter()

# Health & models

@router.get("/health")
async def health():
    return {
        "status":           "ok",
        "version":          "0.9.0",
        "providers":        {name: True for name in clients},
        "available_models": len(AVAILABLE_MODELS),
    }


@router.get("/models")
async def list_models():
    result = {}
    for model_id, info in AVAILABLE_MODELS.items():
        provider  = info["provider"]
        available = provider in clients
        result[model_id] = {**info, "available": available}
    return {"models": result}


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
            results[name] = {"status": "error", "model": test_model, "error": f"{type(e).__name__}: {e}"}
    return {"providers": results}


# ML feedback & retrain

@limiter.limit("20/minute")
@router.post("/ml/feedback", dependencies=[Depends(check_admin_key)])
async def ml_feedback(request: Request, data: TrainingFeedback, db: AsyncSession = Depends(get_db)):
    try:
        metrics_dict = {
            "chars_per_second":             data.metrics.chars_per_second,
            "session_message_count":        data.metrics.session_message_count,
            "avg_prompt_length":            data.metrics.avg_prompt_length,
            "used_advanced_features_count": getattr(data.metrics, "used_advanced_features_count", 0),
            "tooltip_click_count":          getattr(data.metrics, "tooltip_click_count", 0),
        }
        features = ml_classifier.extract_features(data.prompt_text, metrics_dict, count_technical_terms, has_structured_patterns)
        row = MLFeedback(
            prompt_text=data.prompt_text,
            prompt_length=float(features[0]),
            word_count=float(features[1]),
            tech_term_count=float(features[2]),
            has_structure=float(features[3]),
            chars_per_second=float(features[4]),
            session_message_count=float(features[5]),
            avg_prompt_length=float(features[6]),
            used_advanced_features_count=float(features[7]),
            tooltip_click_count=float(features[8]),
            actual_level=data.actual_level,
        )
        db.add(row)
        await db.commit()
        return {"ok": True, "message": "Feedback saved"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/ml/retrain", response_model=RetrainResponse, dependencies=[Depends(check_admin_key)])
async def ml_retrain(
    request: Request,
    model_type: str = Query(default="LogisticRegression", regex="^(LogisticRegression|RandomForest|SVC)$"),
    db: AsyncSession = Depends(get_db),
):
    """Retrain the ML classifier with proper train/test split and cross-validation."""
    try:
        result = await db.execute(select(MLFeedback))
        rows = result.scalars().all()

        # Combine with synthetic data if not enough real data
        syn_texts, syn_beh, syn_y = ml_classifier._create_synthetic_training_data()

        if len(rows) >= 10:
            texts, behavioral_X, y = _load_data_from_rows(rows)
        elif rows:
            real_texts, real_beh, real_y = _load_data_from_rows(rows)
            texts = list(syn_texts) + list(real_texts)
            behavioral_X = np.vstack([syn_beh, real_beh])
            y = np.concatenate([syn_y, real_y])
        else:
            return RetrainResponse(
                ok=False,
                message=f"No feedback samples. Collect at least 10.",
                samples_used=0,
            )

        eval_result = train_and_evaluate(texts, behavioral_X, y, model_type=model_type)
        clf = eval_result["classifier"]

        # Persist model to DB
        weights_json = json.dumps(clf.to_dict())
        report_json = json.dumps(eval_result["classification_report"], ensure_ascii=False)

        existing = await db.execute(select(MLModelCache).where(MLModelCache.id == 1))
        cache_row = existing.scalar_one_or_none()
        if cache_row:
            cache_row.weights_json = weights_json
            cache_row.model_type = model_type
            cache_row.accuracy = eval_result["accuracy"]
            cache_row.f1_score = eval_result["f1_macro"]
            cache_row.classification_report_json = report_json
            cache_row.samples_used = eval_result["samples_total"]
        else:
            db.add(MLModelCache(
                id=1,
                weights_json=weights_json,
                model_type=model_type,
                accuracy=eval_result["accuracy"],
                f1_score=eval_result["f1_macro"],
                classification_report_json=report_json,
                samples_used=eval_result["samples_total"],
            ))
        await db.commit()

        # Update in-memory classifier
        ml_classifier._classifier.from_dict(clf.to_dict())

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
            confusion_matrix=eval_result["confusion_matrix"],
            classification_report=eval_result["classification_report"],
        )

    except Exception as e:
        logger.error(f"[retrain] {e}")
        return RetrainResponse(ok=False, message=f"Retrain failed: {e}")


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
        fieldnames=["Timestamp", "SessionID", "UserEmail", "Level", "Prompt", "Score", "NormalizedScore", "TypingSpeed", "Metrics"],
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
    result = await db.execute(select(func.count(InteractionLog.id)))
    total = result.scalar() or 0
    return {"total_interactions": total}


@router.get("/stats/ml", dependencies=[Depends(check_admin_key)])
async def ml_stats(db: AsyncSession = Depends(get_db)):
    # Fetch saved model metadata
    model_meta = {}
    model_row = await db.execute(select(MLModelCache).where(MLModelCache.id == 1))
    cached = model_row.scalar_one_or_none()
    if cached:
        model_meta = {
            "model_type": cached.model_type or "LogisticRegression",
            "accuracy": cached.accuracy or 0.0,
            "f1_score": cached.f1_score or 0.0,
            "samples_used": cached.samples_used or 0,
            "updated_at": cached.updated_at.isoformat() if cached.updated_at else None,
            "classification_report": json.loads(cached.classification_report_json or "{}"),
        }

    # Feedback stats
    fb_result = await db.execute(select(func.count(MLFeedback.id)))
    feedback_count = fb_result.scalar() or 0

    # Interaction log stats
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
        }

    level_dist = {1: 0, 2: 0, 3: 0}
    score_by_level = {1: [], 2: [], 3: []}
    norm_by_level = {1: [], 2: [], 3: []}
    confusion = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    ml_correct = 0

    for log in logs:
        lvl = max(1, min(3, log.user_level))
        level_dist[lvl] += 1
        score_by_level[lvl].append(log.score_awarded or 0)
        norm_by_level[lvl].append(log.normalized_score or 0)
        try:
            metrics_dict = json.loads(log.metrics_json or "{}")
            ml_level, _ = ml_classifier.ml_predict(log.prompt_text or "", metrics_dict)
            ml_level = max(1, min(3, ml_level))
            confusion[lvl - 1][ml_level - 1] += 1
            if ml_level == lvl:
                ml_correct += 1
        except Exception:
            pass

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
    }