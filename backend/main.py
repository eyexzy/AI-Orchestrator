import json
import os
import sys
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from database import init_db, AsyncSessionLocal, MLModelCache
from dependencies import limiter
import ml_classifier

load_dotenv()

logger = logging.getLogger("ai-orchestrator")
logging.basicConfig(level=logging.INFO)


# Environment validation

def _validate_env():
    is_production = os.getenv("ENV", "development") == "production"

    has_any_llm_key = any([
        os.getenv("OPENAI_API_KEY"),
        os.getenv("GOOGLE_API_KEY"),
        os.getenv("GROQ_API_KEY"),
        os.getenv("OPENROUTER_API_KEY"),
    ])

    warnings = []
    errors = []

    if not has_any_llm_key:
        warnings.append("No LLM API keys found — mock responses will be used")

    if not os.getenv("ADMIN_API_KEY"):
        warnings.append("ADMIN_API_KEY not set — admin/chat/template endpoints have no key protection")
    if not os.getenv("AUTH_SECRET"):
        warnings.append("AUTH_SECRET not set — JWT authentication will fail for protected endpoints")

    if is_production:
        if not os.getenv("DATABASE_URL"):
            errors.append("DATABASE_URL is required in production")
        if not os.getenv("ALLOWED_ORIGINS"):
            errors.append("ALLOWED_ORIGINS is required in production")

    for w in warnings:
        logger.warning(f"[config]  {w}")

    if errors:
        for e in errors:
            logger.error(f"[config] {e}")
        sys.exit(1)


_validate_env()


# Lifespan

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # Load or initialize ML model from DB
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MLModelCache).where(MLModelCache.id == 1))
        cache_row = result.scalar_one_or_none()
        if cache_row:
            try:
                ml_classifier.get_classifier().from_dict(json.loads(cache_row.weights_json))
                logger.info(f"[ml] Model loaded from database (type={cache_row.model_type}, f1={cache_row.f1_score})")
            except Exception as e:
                logger.warning(f"[ml] Failed to load cached model: {e} — retraining from scratch")
                ml_classifier._train_fresh()
                weights_json = json.dumps(ml_classifier.get_classifier().to_dict())
                cache_row.weights_json = weights_json
                cache_row.model_type = "LogisticRegression"
                await db.commit()
        else:
            ml_classifier._train_fresh()
            weights_json = json.dumps(ml_classifier.get_classifier().to_dict())
            db.add(MLModelCache(id=1, weights_json=weights_json, model_type="LogisticRegression"))
            await db.commit()
            logger.info("[ml] Synthetic model trained and saved to database")

    yield


# App

app = FastAPI(
    title="AI-Orchestrator Backend",
    version="0.9.0",
    description="Adaptive UX scoring engine + multi-provider LLM proxy",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Api-Key"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Register routers

from routers.analyze import router as analyze_router
from routers.generate import router as generate_router
from routers.chats import router as chats_router
from routers.admin import router as admin_router
from routers.templates import router as templates_router
from routers.profile import router as profile_router

app.include_router(analyze_router)
app.include_router(generate_router)
app.include_router(chats_router)
app.include_router(admin_router)
app.include_router(templates_router)
app.include_router(profile_router)