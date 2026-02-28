import os
import sys
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import init_db
from dependencies import limiter

load_dotenv()

logger = logging.getLogger("ai-orchestrator")
logging.basicConfig(level=logging.INFO)


# ---------------------------------------------------------------------------
# Environment validation
# ---------------------------------------------------------------------------

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

    if is_production:
        if not os.getenv("DATABASE_URL"):
            errors.append("DATABASE_URL is required in production")
        if not os.getenv("ALLOWED_ORIGINS"):
            errors.append("ALLOWED_ORIGINS is required in production")

    for w in warnings:
        logger.warning(f"[config] ⚠️  {w}")

    if errors:
        for e in errors:
            logger.error(f"[config] ❌ {e}")
        sys.exit(1)


_validate_env()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

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
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------

from routers.analyze import router as analyze_router
from routers.generate import router as generate_router
from routers.chats import router as chats_router
from routers.admin import router as admin_router

app.include_router(analyze_router)
app.include_router(generate_router)
app.include_router(chats_router)
app.include_router(admin_router)
