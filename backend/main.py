import os
import re
import sys
import io
import csv
import json
import math
import time
import random
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import init_db, get_db, save_interaction, AsyncSessionLocal, InteractionLog, UserProfile, ChatSession, ChatMessage
import ml_classifier

load_dotenv()

logger = logging.getLogger("ai-orchestrator")
logging.basicConfig(level=logging.INFO)


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

# ── Optional API key protection for sensitive endpoints ──────────────────────
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")  # empty = no protection in dev


def _check_admin_key(x_api_key: str = Header(default="")):
    """Dependency: require ADMIN_API_KEY header when env var is set."""
    if ADMIN_API_KEY and x_api_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key")


limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


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
# LLM Provider clients (all OpenAI-compatible)
# ---------------------------------------------------------------------------

OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY    = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY      = os.getenv("GROQ_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

clients: dict[str, AsyncOpenAI] = {}

API_TIMEOUT    = 10.0
API_MAX_RETRIES = 0

if OPENAI_API_KEY:
    clients["openai"] = AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=API_TIMEOUT, max_retries=API_MAX_RETRIES)
    logger.info("OpenAI client initialized")

if GOOGLE_API_KEY:
    clients["google"] = AsyncOpenAI(
        api_key=GOOGLE_API_KEY,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        timeout=API_TIMEOUT,
        max_retries=API_MAX_RETRIES,
    )
    logger.info("Google Gemini client initialized")

if GROQ_API_KEY:
    clients["groq"] = AsyncOpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
        timeout=API_TIMEOUT,
        max_retries=API_MAX_RETRIES,
    )
    logger.info("Groq client initialized")

if OPENROUTER_API_KEY:
    clients["openrouter"] = AsyncOpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        timeout=API_TIMEOUT,
        max_retries=API_MAX_RETRIES,
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "AI-Orchestrator",
        },
    )
    logger.info("OpenRouter client initialized")


# ---------------------------------------------------------------------------
# Available models registry
# ---------------------------------------------------------------------------

AVAILABLE_MODELS = {
    "gpt-4o":           {"provider": "openai",      "label": "GPT-4o",                     "api_name": "gpt-4o"},
    "gpt-4o-mini":      {"provider": "openai",      "label": "GPT-4o Mini",                "api_name": "gpt-4o-mini"},
    "gemini-2.0-flash": {"provider": "google",      "label": "Gemini 2.0 Flash",           "api_name": "gemini-2.0-flash"},
    "gemini-1.5-pro":   {"provider": "google",      "label": "Gemini 1.5 Pro",             "api_name": "gemini-1.5-pro"},
    "llama-3.3-70b":    {"provider": "groq",        "label": "Llama 3.3 70B (Groq)",       "api_name": "llama-3.3-70b-versatile"},
    "llama-3.1-8b":     {"provider": "groq",        "label": "Llama 3.1 8B (Groq)",        "api_name": "llama-3.1-8b-instant"},
    "mixtral-8x7b":     {"provider": "groq",        "label": "Mixtral 8x7B (Groq)",        "api_name": "mixtral-8x7b-32768"},
    "or-llama-70b":     {"provider": "openrouter",  "label": "Llama 3.3 70B (OpenRouter)", "api_name": "meta-llama/llama-3.3-70b-instruct:free"},
    "or-deepseek-r1":   {"provider": "openrouter",  "label": "DeepSeek R1 (OpenRouter)",   "api_name": "deepseek/deepseek-r1-0528:free"},
    "or-gemma-27b":     {"provider": "openrouter",  "label": "Gemma 3 27B (OpenRouter)",   "api_name": "google/gemma-3-27b-it:free"},
    "or-qwen3-coder":   {"provider": "openrouter",  "label": "Qwen3 Coder (OpenRouter)",   "api_name": "qwen/qwen3-coder:free"},
    "or-mistral-small": {"provider": "openrouter",  "label": "Mistral Small 3.1 (OpenRouter)", "api_name": "mistralai/mistral-small-3.1-24b-instruct:free"},
}

# ---------------------------------------------------------------------------
# Analyze endpoint
# ---------------------------------------------------------------------------

TECHNICAL_TERMS = {
    "api", "json", "token", "llm", "gpt", "transformer", "embedding",
    "fine-tune", "fine-tuning", "rag", "vector", "prompt engineering",
    "chain-of-thought", "few-shot", "zero-shot", "temperature", "top-p",
    "top-k", "logprobs", "system message", "context window", "hallucination",
    "grounding", "retrieval", "agent", "tool use", "function calling",
    "openai", "claude", "anthropic", "langchain", "llamaindex",
    "tokenizer", "bpe", "attention", "self-attention", "multihead",
    "inference", "latency", "throughput", "batch", "streaming",
    "supervised", "unsupervised", "reinforcement", "neural network",
    "backpropagation", "gradient", "loss function", "optimizer",
    "hyperparameter", "epoch", "learning rate", "dropout", "regularization",
    "bert", "diffusion", "stable diffusion", "midjourney", "dall-e",
    "whisper", "tts", "stt", "asr", "nlp", "nlg", "nlu",
    "classification", "regression", "clustering", "dimensionality reduction",
    "pca", "t-sne", "umap", "cosine similarity", "faiss", "pinecone",
    "chromadb", "weaviate", "sql", "nosql", "rest", "graphql", "websocket",
    "docker", "kubernetes", "ci/cd", "mlops", "devops",
}


class BehavioralMetrics(BaseModel):
    chars_per_second:            float = Field(default=0, ge=0)
    session_message_count:       int   = Field(default=0, ge=0)
    avg_prompt_length:           float = Field(default=0, ge=0)
    changed_temperature:         bool  = False
    changed_model:               bool  = False
    used_system_prompt:          bool  = False
    used_variables:              bool  = False
    used_advanced_features_count: int  = Field(default=0, ge=0)
    tooltip_click_count:         int   = Field(default=0, ge=0)
    suggestion_click_count:      int   = Field(default=0, ge=0)
    cancel_action_count:         int   = Field(default=0, ge=0)
    session_duration_seconds:    float = Field(default=0, ge=0)


class TrainingFeedback(BaseModel):
    prompt_text:  str
    metrics:      BehavioralMetrics
    actual_level: int = Field(ge=1, le=3)


class AnalyzeRequest(BaseModel):
    prompt_text: str
    metrics:     BehavioralMetrics | None = None
    session_id:  str = "unknown"
    user_email:  str = "anonymous"   # ← NEW: bind profile to user, not session


class ScoreBreakdown(BaseModel):
    category:   str
    points:     float
    max_points: float
    detail:     str


class AnalyzeResponse(BaseModel):
    suggested_level: int   = Field(ge=1, le=3)
    final_level:     int   = Field(ge=1, le=3)
    confidence:      float = Field(ge=0, le=1)
    reasoning:       list[str]
    score:           float
    normalized_score: float = Field(ge=0, le=1)
    breakdown:       list[ScoreBreakdown]
    thresholds:      dict


def _count_technical_terms(text: str) -> int:
    lower = text.lower()
    return sum(1 for term in TECHNICAL_TERMS if term in lower)


def _has_structured_patterns(text: str) -> bool:
    patterns = [
        r"\{\{.*?\}\}",
        r"```",
        r"system\s*(?:message|prompt|:)",
        r"step\s*\d",
        r"\bif\b.*\bthen\b",
        r"(?:^|\n)\s*[-*]\s+",
        r"\brole\s*:",
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


# ---------------------------------------------------------------------------
# NEW: Semantic analysis helpers (Task #2)
# ---------------------------------------------------------------------------

def _has_role_pattern(text: str) -> bool:
    """Detect role-assignment patterns in Ukrainian and English."""
    patterns = [
        r"уяви,?\s*що\s+ти",
        r"дій\s+як",
        r"в\s+ролі",
        r"як\s+експерт",
        r"act\s+as",
        r"you\s+are\s+(?:a|an)\s+",
        r"imagine\s+you(?:'re|\s+are)",
        r"pretend\s+(?:you(?:'re|\s+are)|to\s+be)",
        r"as\s+an?\s+expert",
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def _has_format_requirement(text: str) -> bool:
    """Detect explicit output-format instructions."""
    patterns = [
        r"у\s+форматі",
        r"у\s+вигляді\s+таблиці",
        r"покроково",
        r"markdown",
        r"\bjson\b",
        r"step[\s-]by[\s-]step",
        r"as\s+a\s+table",
        r"in\s+(?:the\s+)?format",
        r"bullet\s*points?",
        r"numbered\s+list",
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def _has_politeness_words(text: str) -> bool:
    """Detect conversational / polite phrasing (indicates beginner tone)."""
    patterns = [
        r"будь\s+ласка",
        r"дякую",
        r"чи\s+не\s+міг\s+би\s+ти",
        r"\bplease\b",
        r"\bthanks?\s*you\b",
        r"\bthanks\b",
        r"could\s+you\s+(?:please|kindly)",
        r"would\s+you\s+mind",
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

MAX_SCORE    = 13.5        # ← Updated (was 14.0)
L2_THRESHOLD = 0.25
L3_THRESHOLD = 0.55


def compute_score(request: AnalyzeRequest):
    text    = request.prompt_text.strip()
    metrics = request.metrics or BehavioralMetrics()
    reasons: list[str]         = []
    breakdown: list[ScoreBreakdown] = []

    length     = len(text)
    word_count = len(text.split())
    tech_count = _count_technical_terms(text)
    has_structure = _has_structured_patterns(text)
    has_role      = _has_role_pattern(text)
    has_format    = _has_format_requirement(text)
    has_politeness = _has_politeness_words(text)

    score = 0.0

    # ── Prompt Length (max 2.0) ─────────────────────────────────────────────
    pts = 0.0
    if length > 200:
        pts = 2.0; reasons.append(f"Long prompt ({length} chars)")
    elif length > 80:
        pts = 1.0; reasons.append(f"Medium prompt ({length} chars)")
    score += pts
    breakdown.append(ScoreBreakdown(category="Prompt Length", points=pts, max_points=2.0, detail=f"{length} characters"))

    # ── Word Count (max 1.5) ───────────────────────────────────────────────
    pts = 0.0
    if word_count > 40:
        pts = 1.5; reasons.append(f"Detailed prompt ({word_count} words)")
    elif word_count > 15:
        pts = 0.5
    score += pts
    breakdown.append(ScoreBreakdown(category="Word Count", points=pts, max_points=1.5, detail=f"{word_count} words"))

    # ── Technical Terms (max 3.0) ──────────────────────────────────────────
    pts = 0.0
    if tech_count >= 4:
        pts = 3.0; reasons.append(f"Heavy technical vocabulary ({tech_count} terms)")
    elif tech_count >= 2:
        pts = 1.5; reasons.append(f"Some technical terms ({tech_count})")
    elif tech_count >= 1:
        pts = 0.5
    score += pts
    breakdown.append(ScoreBreakdown(category="Technical Terms", points=pts, max_points=3.0, detail=f"{tech_count} recognized terms"))

    # ── Structure & Context (max 3.0) — UPGRADED ──────────────────────────
    pts = 0.0
    detail_parts: list[str] = []
    if has_structure:
        pts += 1.0
        detail_parts.append("structured patterns")
    if has_role:
        pts += 1.0
        detail_parts.append("role assignment")
    if has_format:
        pts += 1.0
        detail_parts.append("format requirement")
    if detail_parts:
        reasons.append(f"Structure & Context detected: {', '.join(detail_parts)}")
    score += pts
    breakdown.append(ScoreBreakdown(
        category="Structure & Context",
        points=pts,
        max_points=3.0,
        detail=json.dumps(detail_parts, ensure_ascii=False) if detail_parts else "None",
    ))

    # ── Typing Speed (max 1.0) ─────────────────────────────────────────────
    # Cap at 15 chars/sec — copy-paste produces hundreds, which shouldn't score
    effective_speed = min(metrics.chars_per_second, 15.0)
    pts = 1.0 if effective_speed > 5 else 0.0
    if pts > 0: reasons.append("Fast typing speed")
    score += pts
    breakdown.append(ScoreBreakdown(category="Typing Speed", points=pts, max_points=1.0, detail=f"{metrics.chars_per_second:.1f} chars/sec (capped at 15)"))

    # ── Session Activity (max 1.0) ─────────────────────────────────────────
    pts = 0.0
    if metrics.session_message_count > 10:
        pts = 1.0; reasons.append("Experienced session (many messages)")
    elif metrics.session_message_count > 5:
        pts = 0.5
    score += pts
    breakdown.append(ScoreBreakdown(category="Session Activity", points=pts, max_points=1.0, detail=f"{metrics.session_message_count} messages"))

    # ── Avg Prompt Length (max 1.0) ────────────────────────────────────────
    pts = 1.0 if metrics.avg_prompt_length > 150 else 0.0
    if pts > 0: reasons.append("Consistently long prompts")
    score += pts
    breakdown.append(ScoreBreakdown(category="Avg Prompt Length", points=pts, max_points=1.0, detail=f"{metrics.avg_prompt_length:.0f} chars avg"))

    # ── Advanced Features (max 2.0) ────────────────────────────────────────
    adv = getattr(metrics, "used_advanced_features_count", 0) or 0
    pts = 0.0
    if adv >= 3:
        pts = 2.0; reasons.append(f"Active use of advanced features ({adv} actions)")
    elif adv >= 1:
        pts = 1.0; reasons.append(f"Some advanced features used ({adv} actions)")
    score += pts
    breakdown.append(ScoreBreakdown(category="Advanced Features", points=pts, max_points=2.0, detail=f"{adv} advanced actions"))

    # ── Self-sufficiency (max 0.5) ─────────────────────────────────────────
    pts = 0.5 if metrics.tooltip_click_count == 0 and metrics.session_message_count > 3 else 0.0
    score += pts
    breakdown.append(ScoreBreakdown(category="Self-sufficiency", points=pts, max_points=0.5, detail="No help needed" if pts > 0 else "Used hints"))

    # ── Politeness penalty (-0.5) ──────────────────────────────────────────
    if has_politeness:
        penalty = -0.5
        score = max(0.0, score + penalty)
        reasons.append("Conversational/Polite tone detected (-0.5 pts)")
        breakdown.append(ScoreBreakdown(
            category="Politeness Penalty",
            points=penalty,
            max_points=0.0,
            detail="Polite/conversational phrasing found",
        ))

    # ── Normalize & determine level ────────────────────────────────────────
    normalized = min(score / MAX_SCORE, 1.0)
    confidence = 1 - math.exp(-score / 3)

    if normalized >= L3_THRESHOLD:
        level = 3
    elif normalized >= L2_THRESHOLD:
        level = 2
    else:
        level = 1

    metrics_dict = {
        "chars_per_second":             metrics.chars_per_second,
        "session_message_count":        metrics.session_message_count,
        "avg_prompt_length":            metrics.avg_prompt_length,
        "used_advanced_features_count": getattr(metrics, "used_advanced_features_count", 0),
        "tooltip_click_count":          getattr(metrics, "tooltip_click_count", 0),
    }
    ml_level, ml_conf = ml_classifier.ml_predict(text, metrics_dict, _count_technical_terms, _has_structured_patterns)

    # ── ML blending: weighted combination instead of fixed score bump ──────
    # Rule-based normalized score + ML normalized score (1→0.0, 2→0.5, 3→1.0)
    # Blend ratio: 70% rules / 30% ML, but only when ML is reasonably confident
    if ml_conf > 0.5:
        ml_normalized = (ml_level - 1) / 2.0
        ml_weight = 0.3 * ml_conf            # max 0.3 when confidence=1.0
        blended = normalized * (1 - ml_weight) + ml_normalized * ml_weight
        if abs(blended - normalized) > 0.03:  # only log meaningful shifts
            reasons.append(f"ML adjustment: L{ml_level} suggestion ({ml_conf:.0%} confidence)")
        normalized = blended
        score = round(blended * MAX_SCORE, 2)
        if normalized >= L3_THRESHOLD:
            level = 3
        elif normalized >= L2_THRESHOLD:
            level = 2
        else:
            level = 1

    if not reasons:
        reasons.append("Simple short prompt — Guided mode recommended")

    return level, round(confidence, 2), reasons, round(score, 2), round(normalized, 4), breakdown


# ---------------------------------------------------------------------------
# Generate endpoint
# ---------------------------------------------------------------------------

MOCK_RESPONSES = [
    "Це чудове запитання! Ось що я можу сказати з цього приводу.\n\n"
    "Штучний інтелект — це галузь комп'ютерних наук, яка займається створенням "
    "систем, здатних виконувати завдання, що зазвичай потребують людського інтелекту. "
    "Це включає розпізнавання мови, прийняття рішень, переклад між мовами та візуальне сприйняття.\n\n"
    "Сучасні LLM (Large Language Models) працюють на основі архітектури Transformer, "
    "яка використовує механізм self-attention для обробки послідовностей тексту. "
    "Модель навчається передбачати наступний токен на основі контексту попередніх токенів.",

    "Дякую за ваш запит! Давайте розберемо це детальніше.\n\n"
    "Prompt Engineering — це мистецтво та наука формулювання запитів до мовних моделей "
    "таким чином, щоб отримати найбільш точні та корисні відповіді. "
    "Ключові техніки включають:\n\n"
    "1. **Zero-shot prompting** — запит без прикладів\n"
    "2. **Few-shot prompting** — запит з кількома прикладами\n"
    "3. **Chain-of-thought** — покрокове міркування\n"
    "4. **Role-based prompting** — встановлення ролі для моделі\n\n"
    "Кожна техніка має свої переваги залежно від конкретного завдання.",
]


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class HistoryMessage(BaseModel):
    role:    str  # "user" | "assistant"
    content: str


class GenerateRequest(BaseModel):
    prompt:         str
    system_message: str = ""
    model:          str = "gemini-2.0-flash"
    temperature:    float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens:     int   = Field(default=1024, ge=1, le=4096)
    top_p:          float = Field(default=1.0, ge=0.0, le=1.0)
    top_k:          int   = Field(default=40, ge=1, le=100)
    stream:         bool  = False
    session_id:     str | None = None
    # ── NEW: conversation history ──────────────────────────────────────────
    history:        list[HistoryMessage] = Field(default_factory=list)
    # Keep last N turns to avoid hitting context limits
    history_limit:  int = Field(default=20, ge=0, le=100)


class UsageStats(BaseModel):
    prompt_tokens:     int
    completion_tokens: int
    total_tokens:      int
    model:             str
    temperature:       float
    latency_ms:        int


class GenerateResponse(BaseModel):
    text:     str
    usage:    UsageStats
    raw:      dict
    provider: str


def _get_client_for_model(model_id: str) -> tuple[AsyncOpenAI | None, dict | None]:
    model_info = AVAILABLE_MODELS.get(model_id)
    if not model_info:
        return None, None
    provider = model_info["provider"]
    client   = clients.get(provider)
    return client, model_info


MARKDOWN_SYSTEM_INSTRUCTION = (
    "You are an expert developer. Format your response using Markdown. "
    "Use **Bold** for key concepts. Use lists (bullet points) to break down complex explanations. "
    "NEVER output a wall of text; use headings to separate sections. "
    "When writing code, ALWAYS use code blocks with the correct language tag (e.g., ```python). "
    "Respond in the same language the user writes in (Ukrainian if the user writes Ukrainian)."
)


def _build_messages(req: GenerateRequest) -> list[dict]:
    """Build the full messages array including conversation history."""
    messages: list[dict] = []

    # System message
    system_content = (
        (req.system_message.strip() + "\n\n" + MARKDOWN_SYSTEM_INSTRUCTION)
        if req.system_message.strip()
        else MARKDOWN_SYSTEM_INSTRUCTION
    )
    messages.append({"role": "system", "content": system_content})

    # Conversation history (trim to limit)
    history = req.history[-req.history_limit:] if req.history_limit > 0 else []
    for h in history:
        if h.role in ("user", "assistant") and h.content.strip():
            messages.append({"role": h.role, "content": h.content})

    # Current user message
    messages.append({"role": "user", "content": req.prompt})
    return messages


async def _real_generate(client: AsyncOpenAI, model_info: dict, req: GenerateRequest) -> GenerateResponse:
    """Call any OpenAI-compatible API with full conversation history."""
    messages = _build_messages(req)
    api_model = model_info["api_name"]
    provider  = model_info["provider"]

    create_kwargs: dict = {
        "model":       api_model,
        "messages":    messages,
        "temperature": req.temperature,
        "max_tokens":  req.max_tokens,
        "top_p":       req.top_p,
    }

    # top_k: Google, Groq, and OpenRouter support it via extra_body
    if provider in ("google", "groq", "openrouter") and req.top_k != 40:
        create_kwargs["extra_body"] = {"top_k": req.top_k}

    start    = time.time()
    response = await client.chat.completions.create(**create_kwargs)
    latency  = int((time.time() - start) * 1000)

    text       = response.choices[0].message.content or ""
    usage_data = response.usage

    usage = UsageStats(
        prompt_tokens=     usage_data.prompt_tokens     if usage_data else _estimate_tokens(req.prompt),
        completion_tokens= usage_data.completion_tokens if usage_data else _estimate_tokens(text),
        total_tokens=      usage_data.total_tokens      if usage_data else _estimate_tokens(req.prompt + text),
        model=             api_model,
        temperature=       req.temperature,
        latency_ms=        latency,
    )

    try:
        raw = response.model_dump()
    except Exception:
        raw = {
            "model":   api_model,
            "choices": [{"message": {"content": text}}],
            "usage":   {"prompt_tokens": usage.prompt_tokens, "completion_tokens": usage.completion_tokens},
        }

    return GenerateResponse(text=text, usage=usage, raw=raw, provider=provider)


async def _real_generate_stream(client: AsyncOpenAI, model_info: dict, req: GenerateRequest):
    """Streaming generator — yields SSE-formatted chunks."""
    messages  = _build_messages(req)
    api_model = model_info["api_name"]
    provider  = model_info["provider"]

    create_kwargs: dict = {
        "model":       api_model,
        "messages":    messages,
        "temperature": req.temperature,
        "max_tokens":  req.max_tokens,
        "top_p":       req.top_p,
        "stream":      True,
    }

    if provider in ("google", "groq", "openrouter") and req.top_k != 40:
        create_kwargs["extra_body"] = {"top_k": req.top_k}

    full_text = ""
    try:
        async for chunk in await client.chat.completions.create(**create_kwargs):
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                full_text += delta
                payload = json.dumps({"text": delta, "done": False}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
    except Exception as e:
        logger.error(f"[stream] Error: {e}")

    # Final chunk with done flag
    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': full_text}, ensure_ascii=False)}\n\n"


async def _mock_generate(req: GenerateRequest) -> GenerateResponse:
    """Fallback mock when no API key is present."""
    base = random.choice(MOCK_RESPONSES)

    if req.temperature < 0.3:
        base = base.replace("!", ".").replace("Цікаве", "Розглянемо")
    elif req.temperature > 0.8:
        base += (
            "\n\n*Творча думка:* Спробуйте також розглянути це питання "
            "з іншого боку — можливо, нестандартний підхід дасть кращі результати!"
        )

    if req.system_message:
        prefix = f"[Роль: {req.system_message[:80]}{'...' if len(req.system_message) > 80 else ''}]\n\n"
        base = prefix + base

    # Include mention of history context in mock
    if req.history:
        base = f"[Контекст: {len(req.history)} попередніх повідомлень]\n\n" + base

    tokens = _estimate_tokens(base)
    if tokens > req.max_tokens:
        base   = base[:req.max_tokens * 4] + "..."
        tokens = req.max_tokens

    delay  = random.uniform(0.5, 1.5)
    await asyncio.sleep(delay)
    latency = int(delay * 1000)

    prompt_tokens     = _estimate_tokens(req.prompt + req.system_message)
    completion_tokens = _estimate_tokens(base)

    usage = UsageStats(
        prompt_tokens=     prompt_tokens,
        completion_tokens= completion_tokens,
        total_tokens=      prompt_tokens + completion_tokens,
        model=             req.model,
        temperature=       req.temperature,
        latency_ms=        latency,
    )

    raw = {
        "id":      f"mock-{int(time.time())}",
        "object":  "chat.completion",
        "created": int(time.time()),
        "model":   req.model,
        "_mock":   True,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": base}, "finish_reason": "stop"}],
        "usage":   {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
    }

    return GenerateResponse(text=base, usage=usage, raw=raw, provider="mock")


async def _mock_generate_stream(req: GenerateRequest):
    """Mock streaming for dev/no-key environments."""
    result = await _mock_generate(req)
    words  = result.text.split(" ")
    for word in words:
        payload = json.dumps({"text": word + " ", "done": False}, ensure_ascii=False)
        yield f"data: {payload}\n\n"
        await asyncio.sleep(0.03)
    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': result.text}, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Refine endpoint
# ---------------------------------------------------------------------------

PROMPT_TUTOR_SYSTEM = """You are an expert Prompt Engineer helping a beginner improve their prompt.
The user may write in Ukrainian or English — respond in the SAME language they used.

Output a JSON object with two keys:
  - "improved_prompt": a professional, detailed version of their request (same language as input)
  - "clarifying_questions": an array of 2-3 short questions asking for missing context (same language as input)

Output ONLY valid JSON, with this exact shape:
{
  "improved_prompt": "string",
  "clarifying_questions": ["string", "string", "string"]
}"""


async def _refine_prompt_with_llm(prompt: str) -> dict:
    client = None
    model_info = None

    for model_id in ["gpt-4o-mini", "llama-3.1-8b", "gemini-2.0-flash", "llama-3.3-70b", "or-mistral-small", "or-gemma-27b"]:
        info = AVAILABLE_MODELS.get(model_id)
        if info:
            c = clients.get(info["provider"])
            if c:
                client     = c
                model_info = info
                break

    if not client:
        for info in AVAILABLE_MODELS.values():
            c = clients.get(info["provider"])
            if c:
                client     = c
                model_info = info
                break

    if not client or not model_info:
        raise RuntimeError("no_client")

    api_model = model_info["api_name"]
    provider  = model_info["provider"]

    create_kwargs: dict = {
        "model": api_model,
        "messages": [
            {"role": "system", "content": PROMPT_TUTOR_SYSTEM},
            {"role": "user",   "content": f'User typed: "{prompt}"'},
        ],
        "temperature": 0.7,
        "max_tokens":  600,
    }

    if provider == "openai" or (provider == "groq" and "llama" in api_model):
        create_kwargs["response_format"] = {"type": "json_object"}

    response = await asyncio.wait_for(
        client.chat.completions.create(**create_kwargs),
        timeout=10.0,
    )

    content = (response.choices[0].message.content or "").strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        content = json_match.group(0)

    parsed    = json.loads(content.strip())
    improved  = str(parsed.get("improved_prompt", "")).strip()
    questions = [str(q).strip() for q in parsed.get("clarifying_questions", []) if str(q).strip()][:3]

    if not improved or len(improved) < 20 or len(questions) < 2:
        raise ValueError("low_quality_response")

    while len(questions) < 3:
        questions.append(questions[-1])

    return {"improved_prompt": improved, "clarifying_questions": questions}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status":           "ok",
        "version":          "0.9.0",
        "providers":        {name: True for name in clients},
        "available_models": len(AVAILABLE_MODELS),
    }


@app.get("/models")
async def list_models():
    result = {}
    for model_id, info in AVAILABLE_MODELS.items():
        provider  = info["provider"]
        available = provider in clients
        result[model_id] = {**info, "available": available}
    return {"models": result}


@limiter.limit("60/minute")
@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: Request, body: AnalyzeRequest, db: AsyncSession = Depends(get_db)) -> AnalyzeResponse:
    suggested_level, confidence, reasons, score, normalized, breakdown = compute_score(body)

    typing_speed = body.metrics.chars_per_second if body.metrics else 0.0
    metrics_dict = body.metrics.model_dump()      if body.metrics else {}

    # ── user_email as PK — survives page reloads and new sessions ──
    profile_key = body.user_email if body.user_email != "anonymous" else body.session_id
    result = await db.execute(select(UserProfile).where(UserProfile.user_email == profile_key))
    profile = result.scalars().first()
    if not profile:
        profile = UserProfile(user_email=profile_key)
        db.add(profile)

    history: list[int] = json.loads(profile.level_history_json or "[]")
    history.append(suggested_level)
    history = history[-3:]

    current     = profile.current_level or 1
    higher_count = sum(1 for l in history if l > current)
    all_lower    = len(history) == 3 and all(l < current for l in history)

    final_level = current
    if higher_count >= 2 and current < 3:
        final_level = current + 1
    if all_lower and current > 1:
        final_level = current - 1

    profile.current_level      = final_level
    profile.level_history_json = json.dumps(history)
    profile.consecutive_high   = ((profile.consecutive_high or 0) + 1 if suggested_level > current else 0)
    await db.commit()

    await save_interaction(
        db=db, session_id=body.session_id, user_email=body.user_email,
        user_level=final_level, prompt_text=body.prompt_text,
        score=score, normalized=normalized,
        typing_speed=typing_speed, metrics=metrics_dict,
    )

    return AnalyzeResponse(
        suggested_level= suggested_level, final_level= final_level, confidence= confidence,
        reasoning= reasons, score= score, normalized_score= normalized,
        breakdown= breakdown, thresholds={"L2": L2_THRESHOLD, "L3": L3_THRESHOLD},
    )


@limiter.limit("10/minute")
@app.post("/refine")
async def refine(request: Request, body: dict) -> dict:
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt is required")
    try:
        return await _refine_prompt_with_llm(prompt)
    except Exception as e:
        logger.error(f"[refine] Failed: {type(e).__name__}: {e}")

        # ── Fallback: Ukrainian/English template instead of 503 ──
        is_ukrainian = any(c in prompt for c in "іїєґІЇЄҐ")
        if is_ukrainian:
            improved = (
                f"Будь ласка, надай детальну та структуровану відповідь на наступний запит: {prompt}. "
                "Розкрий тему покроково, використовуй приклади та поясни кожен крок."
            )
            questions = [
                "Який рівень деталізації вам потрібен?",
                "Для якої мети ви використовуєте цю інформацію?",
                "Чи є конкретний формат або стиль відповіді, який вам підходить?",
            ]
        else:
            improved = (
                f"Please provide a detailed and well-structured response to the following request: {prompt}. "
                "Break down the topic step by step, use examples, and explain each step clearly."
            )
            questions = [
                "What level of detail do you need?",
                "What is the purpose of this information?",
                "Is there a specific format or style you prefer?",
            ]
        return {"improved_prompt": improved, "clarifying_questions": questions}


@limiter.limit("20/minute")
@app.post("/generate")
async def generate(request: Request, body: GenerateRequest, db: AsyncSession = Depends(get_db)):
    logger.info(
        f"[generate] model={body.model}, prompt_len={len(body.prompt)}, "
        f"history={len(body.history)}, stream={body.stream}, top_p={body.top_p}, top_k={body.top_k}"
    )
    client, model_info = _get_client_for_model(body.model)

    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {body.model}")

    # ── Validate / auto-create chat session ────────────────────────────────
    if body.session_id:
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == body.session_id)
        )
        existing_session = result.scalars().first()
        if not existing_session:
            logger.warning(
                f"[generate] session_id={body.session_id} not found — auto-creating"
            )
            new_session = ChatSession(
                id=body.session_id,
                user_email="anonymous",
                title=body.prompt[:60].strip() + ("…" if len(body.prompt) > 60 else ""),
            )
            db.add(new_session)
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise HTTPException(
                    status_code=400,
                    detail=f"Chat session '{body.session_id}' not found and could not be created",
                )

    # Persist user message
    if body.session_id:
        user_msg = ChatMessage(session_id=body.session_id, role="user", content=body.prompt)
        db.add(user_msg)
        await db.commit()

    # ── STREAMING path ──────────────────────────────────────────────────────
    if body.stream:
        if client is not None:
            async def stream_with_save():
                full_text = ""
                try:
                    async for chunk in _real_generate_stream(client, model_info, body):
                        yield chunk
                        if chunk.startswith("data: "):
                            try:
                                data = json.loads(chunk[6:])
                                if data.get("done") and data.get("full_text"):
                                    full_text = data["full_text"]
                            except Exception:
                                pass
                finally:
                    if body.session_id and full_text:
                        async with AsyncSessionLocal() as db2:
                            await _save_assistant_message(db2, body, full_text, {}, "stream")
        else:
            async def stream_with_save():
                async for chunk in _mock_generate_stream(body):
                    yield chunk

        return StreamingResponse(stream_with_save(), media_type="text/event-stream")

    # ── NON-STREAMING path ──────────────────────────────────────────────────
    result = None
    if client is not None:
        try:
            result = await asyncio.wait_for(_real_generate(client, model_info, body), timeout=15.0)
        except asyncio.TimeoutError:
            result = await _mock_generate(body)
        except Exception as e:
            logger.error(f"[generate] {model_info['provider']} FAILED: {type(e).__name__}: {e}")
            result = await _mock_generate(body)
    else:
        result = await _mock_generate(body)

    if body.session_id and result:
        meta = {
            "model":      result.usage.model,
            "tokens":     result.usage.total_tokens,
            "latency_ms": result.usage.latency_ms,
            "provider":   result.provider,
        }
        await _save_assistant_message(db, body, result.text, meta, result.provider)

    return result


async def _save_assistant_message(db: AsyncSession, body: GenerateRequest, text: str, meta: dict, provider: str):
    """Persist assistant reply and update chat title."""
    ai_msg = ChatMessage(
        session_id=    body.session_id,
        role=          "assistant",
        content=       text,
        metadata_json= json.dumps(meta, ensure_ascii=False),
    )
    db.add(ai_msg)
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == body.session_id)
    )
    sess = result.scalars().first()
    if sess:
        sess.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if sess.title == "Новий чат":
            title = body.prompt[:60].strip()
            if len(body.prompt) > 60:
                title += "…"
            sess.title = title
    await db.commit()


# ---------------------------------------------------------------------------
# ML retrain endpoint (NEW)
# ---------------------------------------------------------------------------

class RetrainResponse(BaseModel):
    ok:             bool
    message:        str
    samples_used:   int  = 0
    train_accuracy: float = 0.0


@app.post("/ml/retrain", response_model=RetrainResponse, dependencies=[Depends(_check_admin_key)])
async def ml_retrain():
    """Retrain the ML classifier on accumulated feedback data."""
    feedback_path = Path("ml_feedback.csv")
    if not feedback_path.exists():
        return RetrainResponse(ok=False, message="ml_feedback.csv not found — collect feedback first")

    try:
        import numpy as np
        from ml_classifier import SimpleLogisticClassifier, MODEL_PATH, FEATURE_NAMES

        X, y = [], []
        feature_cols = FEATURE_NAMES

        with open(feedback_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    features = [float(row[col]) for col in feature_cols]
                    label    = int(row["actual_level"])
                    if label in (1, 2, 3):
                        X.append(features)
                        y.append(label)
                except (KeyError, ValueError):
                    pass

        if len(X) < 10:
            return RetrainResponse(
                ok=False,
                message=f"Not enough samples ({len(X)} < 10). Keep collecting feedback.",
                samples_used=len(X),
            )

        clf = SimpleLogisticClassifier()
        clf.fit(np.array(X), np.array(y), lr=0.01, epochs=1000)
        clf.save(MODEL_PATH)

        # Quick accuracy on training set
        correct = sum(
            1 for xi, yi in zip(X, y)
            if clf.predict(np.array(xi).reshape(1, -1)) == yi
        )
        accuracy = correct / len(X)

        # Reload global classifier
        import ml_classifier as _mc
        _mc._classifier = SimpleLogisticClassifier()
        _mc._classifier.load(MODEL_PATH)

        return RetrainResponse(
            ok=True,
            message=f"Model retrained on {len(X)} samples and saved",
            samples_used=len(X),
            train_accuracy=round(accuracy, 3),
        )

    except Exception as e:
        logger.error(f"[retrain] {e}")
        return RetrainResponse(ok=False, message=f"Retrain failed: {e}")


# ---------------------------------------------------------------------------
# Export / stats  (protected with optional ADMIN_API_KEY)
# ---------------------------------------------------------------------------

@app.get("/export-csv", dependencies=[Depends(_check_admin_key)])
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


@app.get("/stats", dependencies=[Depends(_check_admin_key)])
async def stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(func.count(InteractionLog.id)))
    total = result.scalar() or 0
    return {"total_interactions": total}


@app.get("/stats/ml", dependencies=[Depends(_check_admin_key)])
async def ml_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InteractionLog).order_by(InteractionLog.timestamp.asc())
    )
    logs = result.scalars().all()
    if not logs:
        return {
            "total": 0,
            "level_distribution": {1: 0, 2: 0, 3: 0},
            "avg_score_by_level": {1: 0.0, 2: 0.0, 3: 0.0},
            "avg_normalized_by_level": {1: 0.0, 2: 0.0, 3: 0.0},
            "confusion_matrix": [[0,0,0],[0,0,0],[0,0,0]],
            "ml_accuracy": 0.0,
        }

    level_dist   = {1: 0, 2: 0, 3: 0}
    score_by_level = {1: [], 2: [], 3: []}
    norm_by_level  = {1: [], 2: [], 3: []}
    confusion      = [[0,0,0],[0,0,0],[0,0,0]]
    ml_correct     = 0

    for log in logs:
        lvl = max(1, min(3, log.user_level))
        level_dist[lvl] += 1
        score_by_level[lvl].append(log.score_awarded  or 0)
        norm_by_level[lvl].append(log.normalized_score or 0)
        try:
            metrics_dict = json.loads(log.metrics_json or "{}")
            ml_level, _  = ml_classifier.ml_predict(log.prompt_text or "", metrics_dict)
            ml_level     = max(1, min(3, ml_level))
            confusion[lvl - 1][ml_level - 1] += 1
            if ml_level == lvl:
                ml_correct += 1
        except Exception:
            pass

    return {
        "total":                   len(logs),
        "level_distribution":      level_dist,
        "avg_score_by_level":      {k: round(sum(v)/len(v), 3) if v else 0.0 for k, v in score_by_level.items()},
        "avg_normalized_by_level": {k: round(sum(v)/len(v), 3) if v else 0.0 for k, v in norm_by_level.items()},
        "confusion_matrix":        confusion,
        "ml_accuracy":             round(ml_correct / len(logs), 3) if logs else 0.0,
        "note":                    "confusion_matrix[actual_level-1][ml_predicted_level-1]",
    }


# ---------------------------------------------------------------------------
# Chat history CRUD  (protected by ADMIN_API_KEY)
# ---------------------------------------------------------------------------

class CreateChatRequest(BaseModel):
    user_email: str = "anonymous"
    title:      str = "Новий чат"


class UpdateChatRequest(BaseModel):
    title: str


@app.get("/chats")
async def list_chats(
    user_email: str = "anonymous",
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(_check_admin_key),
):
    stmt = (
        select(ChatSession, func.count(ChatMessage.id).label("msg_count"))
        .outerjoin(ChatMessage, ChatSession.id == ChatMessage.session_id)
        .where(ChatSession.user_email == user_email)
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id":            s.id,
            "title":         s.title,
            "created_at":    s.created_at.isoformat() if s.created_at else None,
            "updated_at":    s.updated_at.isoformat() if s.updated_at else None,
            "message_count": msg_count,
        }
        for s, msg_count in rows
    ]


@app.post("/chats")
async def create_chat(
    req: CreateChatRequest,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(_check_admin_key),
):
    session = ChatSession(user_email=req.user_email, title=req.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {
        "id":            session.id,
        "title":         session.title,
        "created_at":    session.created_at.isoformat() if session.created_at else None,
        "updated_at":    session.updated_at.isoformat() if session.updated_at else None,
        "message_count": 0,
    }


@app.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(_check_admin_key),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == chat_id)
    )
    session = result.scalars().first()
    if not session:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
    )
    msgs = result.scalars().all()
    return [
        {
            "id":         m.id,
            "role":       m.role,
            "content":    m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "metadata":   json.loads(m.metadata_json) if m.metadata_json else {},
        }
        for m in msgs
    ]


@app.patch("/chats/{chat_id}")
async def update_chat(
    chat_id: str,
    req: UpdateChatRequest,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(_check_admin_key),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == chat_id)
    )
    session = result.scalars().first()
    if not session:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    session.title = req.title
    await db.commit()
    return {"ok": True}


@app.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(_check_admin_key),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == chat_id)
    )
    session = result.scalars().first()
    if not session:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    await db.delete(session)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dev / diagnostic endpoints
# ---------------------------------------------------------------------------

@limiter.limit("5/minute")
@app.get("/test-providers", dependencies=[Depends(_check_admin_key)])
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


@limiter.limit("20/minute")
@app.post("/ml/feedback", dependencies=[Depends(_check_admin_key)])
async def ml_feedback(request: Request, data: TrainingFeedback):
    feedback_path = Path("ml_feedback.csv")
    try:
        metrics_dict = {
            "chars_per_second":             data.metrics.chars_per_second,
            "session_message_count":        data.metrics.session_message_count,
            "avg_prompt_length":            data.metrics.avg_prompt_length,
            "used_advanced_features_count": getattr(data.metrics, "used_advanced_features_count", 0),
            "tooltip_click_count":          getattr(data.metrics, "tooltip_click_count", 0),
        }
        features   = ml_classifier.extract_features(data.prompt_text, metrics_dict, _count_technical_terms, _has_structured_patterns)
        file_exists = feedback_path.exists()
        with open(feedback_path, "a", newline="") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow([
                    "prompt_length", "word_count", "tech_term_count", "has_structure",
                    "chars_per_second", "session_message_count", "avg_prompt_length",
                    "used_advanced_features_count", "tooltip_click_count", "actual_level",
                ])
            writer.writerow(list(features) + [data.actual_level])
        return {"ok": True, "message": "Feedback saved"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
