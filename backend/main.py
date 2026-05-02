import asyncio
import inspect
import json
import logging
import os
import sys
from contextlib import asynccontextmanager, suppress
from time import perf_counter
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from database import (
    AsyncSessionLocal,
    DatabaseUnavailableError,
    ENGINE_RUNTIME_CONFIG,
    MLModelCache,
    engine,
    init_db,
)
from dependencies import get_rate_limit_strategy_summary, is_production_env, limiter
from logging_utils import (
    configure_logging,
    get_request_id,
    reset_request_id,
    set_request_id,
)

load_dotenv()
configure_logging()

import ml_classifier
from services.cache import cache
from services.llm import clients

logger = logging.getLogger("ai-orchestrator")


def _get_non_empty_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None

    value = value.strip()
    return value or None


def _apply_response_headers(response: JSONResponse | object, request_id: str):
    if not hasattr(response, "headers"):
        return response

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    )
    return response


def _error_response(
    status_code: int,
    message: str,
    *,
    detail=None,
):
    payload = {
        "error": message,
        "request_id": get_request_id(),
    }
    if detail is not None:
        payload["detail"] = detail
    response = JSONResponse(payload, status_code=status_code)
    return _apply_response_headers(response, get_request_id())


def _validate_env():
    is_production = is_production_env()

    has_any_llm_key = bool(_get_non_empty_env("OPENROUTER_API_KEY"))

    warnings = []
    errors = []

    if not has_any_llm_key:
        warnings.append("OPENROUTER_API_KEY is not set — LLM generation will fail at runtime")

    admin_api_key = _get_non_empty_env("ADMIN_API_KEY")
    auth_secret = _get_non_empty_env("AUTH_SECRET")

    if not admin_api_key:
        message = "ADMIN_API_KEY is required to protect admin endpoints"
        if is_production:
            errors.append(message)
        else:
            warnings.append(f"{message} in production")

    if not auth_secret:
        message = "AUTH_SECRET is required for JWT-protected endpoints"
        if is_production:
            errors.append(message)
        else:
            warnings.append(f"{message} in production")

    if is_production:
        if not _get_non_empty_env("DATABASE_URL"):
            errors.append("DATABASE_URL is required in production")
        if not _get_non_empty_env("ALLOWED_ORIGINS"):
            errors.append("ALLOWED_ORIGINS is required in production")

    for warning in warnings:
        logger.warning("[config] validation_warning", extra={"warning": warning})

    if errors:
        for error in errors:
            logger.error("[config] validation_error", extra={"error": error})
        sys.exit(1)


def _should_warmup_semantic_model() -> bool:
    configured = _get_non_empty_env("SEMANTIC_WARMUP_ON_STARTUP")
    if configured is not None:
        return configured.lower() in {"1", "true", "yes", "on"}
    return is_production_env()


_validate_env()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_ready = await init_db()
    await cache.initialize()
    logger.info(
        "[app] runtime_strategy",
        extra={
            "rate_limiting": get_rate_limit_strategy_summary(),
            "db_pool": ENGINE_RUNTIME_CONFIG,
        },
    )

    # Warm up semantic model at startup — not in the first user request path.
    semantic_warmup_task = None

    if _should_warmup_semantic_model():
        from services.scoring import warmup_semantic_model

        async def _semantic_warmup():
            _t0 = perf_counter()
            semantic_ok = await asyncio.to_thread(warmup_semantic_model)
            _t1 = perf_counter()
            logger.info(
                "[app] semantic_warmup",
                extra={
                    "available": semantic_ok,
                    "duration_ms": int((_t1 - _t0) * 1000),
                },
            )

        semantic_warmup_task = asyncio.create_task(_semantic_warmup())
    else:
        logger.info("[app] semantic_warmup_skipped")

    logger.info("[app] startup")

    if db_ready:
        try:
            async with AsyncSessionLocal() as db:
                cache_meta = None
                try:
                    cache_meta = await ml_classifier.load_latest_model_from_db(db)
                except Exception as exc:
                    logger.warning("[ml] failed_to_load_cached_model", extra={"error": str(exc)})

                if cache_meta:
                    logger.info(
                        "[ml] model_loaded_from_database",
                        extra={
                            "model_id": cache_meta["id"],
                            "model_type": cache_meta["model_type"],
                            "f1_score": cache_meta["f1_score"],
                        },
                    )
                else:
                    ml_classifier._train_fresh()
                    weights_json = json.dumps(ml_classifier.get_classifier().to_dict(), ensure_ascii=False)
                    db.add(MLModelCache(
                        weights_json=weights_json,
                        model_type="LogisticRegression",
                        accuracy=0.0,
                        f1_score=0.0,
                        classification_report_json="{}",
                        samples_used=0,
                    ))
                    try:
                        await db.commit()
                    except Exception as exc:
                        await db.rollback()
                        logger.warning(
                            "[ml] failed_to_persist_synthetic_model",
                            extra={"error": str(exc)},
                        )
                    else:
                        logger.info("[ml] synthetic_model_trained_and_saved")
        except Exception as exc:
            logger.warning("[app] startup_db_phase_failed", extra={"error": str(exc)})
            ml_classifier._train_fresh()
    else:
        logger.warning("[app] startup_without_database")
        ml_classifier._train_fresh()

    # Background task: every 30 s each worker checks if a newer ML model
    # was saved to the DB (e.g. by another worker after admin retraining)
    # and hot-reloads it so all workers converge within one sync interval.
    ML_SYNC_INTERVAL_SECONDS = 30

    async def _ml_model_sync_loop():
        while True:
            await asyncio.sleep(ML_SYNC_INTERVAL_SECONDS)
            try:
                async with AsyncSessionLocal() as db:
                    reloaded = await ml_classifier.check_and_reload_if_newer(db)
                    if reloaded:
                        logger.info("[ml] model_reloaded_by_background_sync")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("[ml] background_sync_error", extra={"error": str(exc)})

    ml_sync_task = asyncio.create_task(_ml_model_sync_loop())
    logger.info("[ml] background_sync_started", extra={"interval_s": ML_SYNC_INTERVAL_SECONDS})

    try:
        yield
    finally:
        ml_sync_task.cancel()
        with suppress(asyncio.CancelledError):
            await ml_sync_task

        if semantic_warmup_task is not None and not semantic_warmup_task.done():
            semantic_warmup_task.cancel()
            with suppress(asyncio.CancelledError):
                await semantic_warmup_task

        await cache.close()
        for provider_name, client in clients.items():
            close_fn = getattr(client, "aclose", None) or getattr(client, "close", None)
            if not callable(close_fn):
                continue

            try:
                maybe_awaitable = close_fn()
                if inspect.isawaitable(maybe_awaitable):
                    await maybe_awaitable
            except Exception as exc:
                logger.warning(
                    "[app] llm_client_shutdown_failed",
                    extra={"provider": provider_name, "error": str(exc)},
                )

        await engine.dispose()
        logger.info("[app] shutdown")


app = FastAPI(
    title="Nexa Backend",
    version="0.9.0",
    description="Adaptive UX scoring engine + multi-provider LLM proxy",
    lifespan=lifespan,
)
app.state.limiter = limiter

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,::1").split(",")
    if host.strip()
]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Api-Key", "X-Request-ID"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid4().hex
    request.state.request_id = request_id
    token = set_request_id(request_id)
    start = perf_counter()
    response = None

    try:
        response = await call_next(request)
        return _apply_response_headers(response, request_id)
    finally:
        duration_ms = int((perf_counter() - start) * 1000)
        logger.info(
            "request.completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code if response is not None else 500,
                "duration_ms": duration_ms,
            },
        )
        reset_request_id(token)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    detail = None if isinstance(exc.detail, str) else exc.detail
    logger.warning(
        "request.http_error",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": exc.status_code,
            "error": message,
        },
    )
    return _error_response(exc.status_code, message, detail=detail)


@app.exception_handler(DatabaseUnavailableError)
async def database_unavailable_handler(request: Request, exc: DatabaseUnavailableError):
    logger.warning(
        "request.database_unavailable",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": 503,
        },
    )
    return _error_response(503, str(exc))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "request.validation_error",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": 422,
        },
    )
    return _error_response(422, "Validation error", detail=exc.errors())


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(
        "request.rate_limited",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": 429,
        },
    )
    return _error_response(429, "Rate limit exceeded")


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "request.unhandled_exception",
        extra={
            "method": request.method,
            "path": request.url.path,
        },
    )
    return _error_response(500, "Internal server error")


from routers.analyze import router as analyze_router
from routers.generate import router as generate_router
from routers.chats import router as chats_router
from routers.admin import router as admin_router
from routers.feedback import router as feedback_router
from routers.templates import router as templates_router
from routers.profile import router as profile_router
from routers.events import router as events_router
from routers.adaptation_feedback import router as adaptation_feedback_router
from routers.product_feedback import router as product_feedback_router
from routers.projects import router as projects_router
from routers.files import router as files_router
from routers.chat_message_feedback import router as chat_message_feedback_router

app.include_router(analyze_router)
app.include_router(generate_router)
app.include_router(chats_router)
app.include_router(projects_router)
app.include_router(admin_router)
app.include_router(feedback_router)
app.include_router(templates_router)
app.include_router(profile_router)
app.include_router(events_router)
app.include_router(adaptation_feedback_router)
app.include_router(product_feedback_router)
app.include_router(files_router)
app.include_router(chat_message_feedback_router)
