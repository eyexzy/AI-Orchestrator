import asyncio
import json
import logging
import os
import random
import re
import time

from openai import AsyncOpenAI

from schemas.api import GenerateRequest, GenerateResponse, UsageStats

logger = logging.getLogger("ai-orchestrator")

# LLM Provider clients (all OpenAI-compatible)

OPENAI_API_KEY     = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY     = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY       = os.getenv("GROQ_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

clients: dict[str, AsyncOpenAI] = {}

def _get_env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


API_TIMEOUT    = _get_env_float("LLM_API_TIMEOUT", 15.0)
API_MAX_RETRIES = 0
VALID_MOCK_MODES = {"off", "when_no_provider", "fallback", "always"}


def get_mock_mode() -> str:
    configured_mode = os.getenv("LLM_MOCK_MODE", "").strip().lower()
    if configured_mode in VALID_MOCK_MODES:
        return configured_mode

    legacy_allow_mock = os.getenv("ALLOW_MOCK", "").strip().lower() in ("1", "true")
    return "fallback" if legacy_allow_mock else "when_no_provider"

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

# Available models registry

AVAILABLE_MODELS = {
    "gpt-4o":           {"provider": "openai",      "label": "GPT-4o",                     "api_name": "gpt-4o"},
    "gpt-4o-mini":      {"provider": "openai",      "label": "GPT-4o Mini",                "api_name": "gpt-4o-mini"},
    "gemini-2.0-flash": {"provider": "google",      "label": "Gemini 2.0 Flash",           "api_name": "gemini-2.0-flash"},
    "gemini-1.5-pro":   {"provider": "google",      "label": "Gemini 1.5 Pro",             "api_name": "gemini-1.5-pro"},
    "llama-3.3-70b":    {"provider": "groq",        "label": "Llama 3.3 70B (Groq)",       "api_name": "llama-3.3-70b-versatile"},
    "llama-3.1-8b":     {"provider": "groq",        "label": "Llama 3.1 8B (Groq)",        "api_name": "llama-3.1-8b-instant"},
    "mixtral-8x7b":     {"provider": "groq",        "label": "Mixtral 8x7B (Groq)",        "api_name": "mixtral-8x7b-32768"},
    "or-llama-70b":     {"provider": "openrouter",  "label": "Llama 3.3 70B (Free)",       "api_name": "meta-llama/llama-3.3-70b-instruct:free"},
    "or-qwen3-coder":   {"provider": "openrouter",  "label": "Qwen3 Coder (Free)",         "api_name": "qwen/qwen3-coder:free"},
    "or-mistral-small": {"provider": "openrouter",  "label": "Mistral Small 3.1 (Free)",   "api_name": "mistralai/mistral-small-3.1-24b-instruct:free"},
    "or-nemotron-nano": {"provider": "openrouter",  "label": "Nemotron Nano 9B (Free)",    "api_name": "nvidia/nemotron-nano-9b-v2:free"},
    "or-glm-4.5-air":   {"provider": "openrouter",  "label": "GLM 4.5 Air (Free)",         "api_name": "z-ai/glm-4.5-air:free"},
    "or-qwen3-4b":      {"provider": "openrouter",  "label": "Qwen3 4B Fast (Free)",       "api_name": "qwen/qwen3-4b:free"},
}

# Helpers

def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def get_client_for_model(model_id: str) -> tuple[AsyncOpenAI | None, dict | None]:
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


def build_messages(req: GenerateRequest) -> list[dict]:
    """Build the full messages array including conversation history."""
    messages: list[dict] = []

    system_content = (
        (req.system_message.strip() + "\n\n" + MARKDOWN_SYSTEM_INSTRUCTION)
        if req.system_message.strip()
        else MARKDOWN_SYSTEM_INSTRUCTION
    )
    messages.append({"role": "system", "content": system_content})

    history = req.history[-req.history_limit:] if req.history_limit > 0 else []
    for h in history:
        if h.role in ("user", "assistant") and h.content.strip():
            messages.append({"role": h.role, "content": h.content})

    messages.append({"role": "user", "content": req.prompt})
    return messages


# Real LLM generation

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


async def real_generate(client: AsyncOpenAI, model_info: dict, req: GenerateRequest) -> GenerateResponse:
    """Call any OpenAI-compatible API with full conversation history."""
    messages  = build_messages(req)
    api_model = model_info["api_name"]
    provider  = model_info["provider"]

    create_kwargs: dict = {
        "model":       api_model,
        "messages":    messages,
        "temperature": req.temperature,
        "max_tokens":  req.max_tokens,
        "top_p":       req.top_p,
    }

    start    = time.time()
    response = await client.chat.completions.create(**create_kwargs)
    latency  = int((time.time() - start) * 1000)

    text       = response.choices[0].message.content or ""
    usage_data = response.usage

    usage = UsageStats(
        prompt_tokens=     usage_data.prompt_tokens     if usage_data else estimate_tokens(req.prompt),
        completion_tokens= usage_data.completion_tokens if usage_data else estimate_tokens(text),
        total_tokens=      usage_data.total_tokens      if usage_data else estimate_tokens(req.prompt + text),
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


async def real_generate_stream(client: AsyncOpenAI, model_info: dict, req: GenerateRequest):
    """Streaming generator — yields SSE-formatted chunks."""
    messages  = build_messages(req)
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

    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': full_text}, ensure_ascii=False)}\n\n"


def _has_real_api_keys() -> bool:
    """Check if at least one real LLM provider API key is configured."""
    return bool(OPENAI_API_KEY or GOOGLE_API_KEY or GROQ_API_KEY or OPENROUTER_API_KEY)


def _is_mock_allowed(reason: str) -> bool:
    mode = get_mock_mode()
    if mode == "always":
        return True
    if mode == "fallback":
        return True
    if mode == "when_no_provider":
        return reason == "no_provider"
    return False


async def mock_generate(
    req: GenerateRequest,
    *,
    reason: str = "no_provider",
) -> GenerateResponse:
    """Fallback mock based on explicit mock-mode configuration."""
    if not _is_mock_allowed(reason):
        if reason == "provider_failure":
            raise RuntimeError(
                "Mock fallback disabled for provider failures. "
                "Set LLM_MOCK_MODE=fallback or always to allow it."
            )
        raise RuntimeError(
            "Mock generation disabled because no provider is available. "
            "Set LLM_MOCK_MODE=when_no_provider, fallback, or always."
        )

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

    if req.history:
        base = f"[Контекст: {len(req.history)} попередніх повідомлень]\n\n" + base

    tokens = estimate_tokens(base)
    if tokens > req.max_tokens:
        base   = base[:req.max_tokens * 4] + "..."
        tokens = req.max_tokens

    delay  = random.uniform(0.5, 1.5)
    await asyncio.sleep(delay)
    latency = int(delay * 1000)

    prompt_tokens     = estimate_tokens(req.prompt + req.system_message)
    completion_tokens = estimate_tokens(base)

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
        "_mock_reason": reason,
        "_mock_mode": get_mock_mode(),
        "choices": [{"index": 0, "message": {"role": "assistant", "content": base}, "finish_reason": "stop"}],
        "usage":   {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
    }

    return GenerateResponse(text=base, usage=usage, raw=raw, provider="mock")


async def mock_generate_stream(
    req: GenerateRequest,
    *,
    reason: str = "no_provider",
):
    """Mock streaming for dev/no-key environments."""
    result = await mock_generate(req, reason=reason)
    words  = result.text.split(" ")
    for word in words:
        payload = json.dumps({"text": word + " ", "done": False}, ensure_ascii=False)
        yield f"data: {payload}\n\n"
        await asyncio.sleep(0.03)
    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': result.text}, ensure_ascii=False)}\n\n"


# Refine prompt with LLM

LEVEL_GUIDANCE = {
    1: (
        "The user is a BEGINNER (L1). "
        "Use simple, friendly language. Explain why missing prompt ingredients matter. "
        "Ask very concrete, down-to-earth clarifying questions. "
        "Keep sentences short."
    ),
    2: (
        "The user is INTERMEDIATE (L2). "
        "Be structured and practical. Focus on task clarity, context, output format, and quality criteria. "
        "Less basic explanation - the user already knows what a prompt is. "
        "Ask questions that sharpen scope."
    ),
    3: (
        "The user is ADVANCED (L3). "
        "Be concise and professional. Skip basics entirely. "
        "Focus on precision, assumptions, evaluation criteria, and output quality. "
        "Ask questions about non-obvious assumptions and success metrics."
    ),
}

PROMPT_TUTOR_SYSTEM = """You are an AI Tutor for prompt engineering. Your job is to TEACH the user how to write stronger prompts, not just rewrite for them.

{level_guidance}

CRITICAL RULES:
- Respond ONLY in {response_language}.
- Output ONLY valid JSON matching the exact schema below - no markdown fences, no extra text.
- Teach through the prompt ingredients: task, context, desired output, quality criteria, and optional example.
- Keep the response compact and practical. This content will be shown in a modal, so avoid long lectures.
- Do NOT recommend advanced controls like temperature, top-p, system prompt editors, variables, or config sidebar features unless the user explicitly asked for them.
- "clarifying_questions" should contain exactly 3 objects with "id" (q1, q2, q3) and "question" fields. Ask only short, high-value questions that materially improve the prompt.
- "strengths" and "gaps" must each contain 1-2 items.
- "why_this_is_better" must contain 2-3 concrete improvements.
- "opening_message" is a 1-2 sentence diagnosis of what is already clear and what is still missing.
- "next_step" is a short reusable prompting pattern the user can remember next time, not just 'try again'.
- Keep the improved_prompt close to the user's original intent. Do not overload it with unnecessary advanced structure.

Output schema:
{{
  "opening_message": "string",
  "strengths": ["string"],
  "gaps": ["string"],
  "clarifying_questions": [
    {{"id": "q1", "question": "string"}},
    {{"id": "q2", "question": "string"}},
    {{"id": "q3", "question": "string"}}
  ],
  "improved_prompt": "string",
  "why_this_is_better": ["string"],
  "next_step": "string"
}}"""


UKRAINIAN_MARKERS = (
    "\u0456", "\u0457", "\u0454", "\u0491",
    "\u0406", "\u0407", "\u0404", "\u0490",
)


def _detect_language(text: str) -> str:
    """Heuristic language detection for tutor responses."""
    if any(ch in text for ch in UKRAINIAN_MARKERS):
        return "uk"

    cyrillic_count = sum(1 for ch in text if "\u0400" <= ch <= "\u04FF")
    latin_count = sum(1 for ch in text if "a" <= ch.lower() <= "z")

    if cyrillic_count == 0:
        return "en"
    if latin_count == 0:
        return "uk"
    return "uk" if cyrillic_count >= latin_count else "en"


def _language_label(lang: str) -> str:
    return "Ukrainian" if lang == "uk" else "English"


def _build_tutor_system_prompt(language: str, level: int) -> str:
    level_guidance = LEVEL_GUIDANCE.get(level, LEVEL_GUIDANCE[1])
    return PROMPT_TUTOR_SYSTEM.format(
        level_guidance=level_guidance,
        response_language=_language_label(language),
    )


def _build_tutor_user_message(
    prompt: str,
    clarification_answers: dict[str, str] | None = None,
) -> str:
    parts = [f'User prompt: "{prompt}"']
    if clarification_answers:
        answers_text = "\n".join(
            f"- {qid}: {answer}" for qid, answer in clarification_answers.items() if answer.strip()
        )
        if answers_text:
            parts.append(f"\nUser answered clarifying questions:\n{answers_text}")
            parts.append(
                "\nUse these answers to produce a significantly better improved_prompt. "
                "Update strengths/gaps/why_this_is_better accordingly."
            )
    return "\n".join(parts)


def _normalize_tutor_response(parsed: dict) -> dict:
    """Validate and normalize the parsed JSON into the expected response shape."""
    opening = str(parsed.get("opening_message", "")).strip()
    strengths = [str(s).strip() for s in parsed.get("strengths", []) if str(s).strip()][:2]
    gaps = [str(g).strip() for g in parsed.get("gaps", []) if str(g).strip()][:2]

    raw_questions = parsed.get("clarifying_questions", [])
    questions: list[dict] = []
    for i, q in enumerate(raw_questions):
        if isinstance(q, dict) and q.get("question"):
            questions.append({
                "id": str(q.get("id", f"q{i+1}")),
                "question": str(q["question"]).strip(),
            })
        elif isinstance(q, str) and q.strip():
            questions.append({"id": f"q{i+1}", "question": q.strip()})
    questions = questions[:3]

    improved = str(parsed.get("improved_prompt", "")).strip()
    why_better = [str(w).strip() for w in parsed.get("why_this_is_better", []) if str(w).strip()][:3]
    next_step = str(parsed.get("next_step", "")).strip()

    if not improved or len(improved) < 20:
        raise ValueError("low_quality_response: improved_prompt too short")
    if len(questions) < 3:
        raise ValueError("low_quality_response: expected 3 clarifying questions")

    return {
        "opening_message": opening,
        "strengths": strengths,
        "gaps": gaps,
        "clarifying_questions": questions,
        "improved_prompt": improved,
        "why_this_is_better": why_better,
        "next_step": next_step,
    }


def _iter_tutor_candidates() -> list[tuple[AsyncOpenAI, dict]]:
    preferred_models = [
        "gpt-4o-mini",
        "llama-3.1-8b",
        "gemini-2.0-flash",
        "llama-3.3-70b",
        "or-mistral-small",
        "or-qwen3-coder",
    ]
    seen_models: set[str] = set()
    candidates: list[tuple[AsyncOpenAI, dict]] = []

    for model_id in preferred_models:
        info = AVAILABLE_MODELS.get(model_id)
        if not info:
            continue
        client = clients.get(info["provider"])
        if not client:
            continue
        candidates.append((client, info))
        seen_models.add(model_id)

    for model_id, info in AVAILABLE_MODELS.items():
        if model_id in seen_models:
            continue
        client = clients.get(info["provider"])
        if not client:
            continue
        candidates.append((client, info))

    return candidates


async def refine_prompt_with_llm(
    prompt: str,
    *,
    language: str | None = None,
    level: int | None = None,
    clarification_answers: dict[str, str] | None = None,
) -> dict:
    lang = language if language in ("en", "uk") else _detect_language(prompt)
    lvl = level if level in (1, 2, 3) else 1

    candidates = _iter_tutor_candidates()
    if not candidates:
        raise RuntimeError("no_client")

    system_prompt = _build_tutor_system_prompt(lang, lvl)
    user_message = _build_tutor_user_message(prompt, clarification_answers)
    last_exc: Exception | None = None

    for client, model_info in candidates:
        api_model = model_info["api_name"]
        provider = model_info["provider"]

        create_kwargs: dict = {
            "model": api_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.7,
            "max_tokens": 1200,
        }

        if provider == "openai" or (provider == "groq" and "llama" in api_model):
            create_kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(**create_kwargs),
                timeout=API_TIMEOUT,
            )

            content = (response.choices[0].message.content or "").strip()
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                content = json_match.group(0)

            parsed = json.loads(content.strip())
            return _normalize_tutor_response(parsed)
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "[refine] tutor_provider_failed",
                extra={
                    "provider": provider,
                    "model": api_model,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            continue

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("no_client")
