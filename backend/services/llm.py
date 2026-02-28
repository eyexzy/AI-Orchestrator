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

# ---------------------------------------------------------------------------
# LLM Provider clients (all OpenAI-compatible)
# ---------------------------------------------------------------------------

OPENAI_API_KEY     = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY     = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY       = os.getenv("GROQ_API_KEY")
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
# Helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Real LLM generation
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

    if provider in ("google", "groq", "openrouter") and req.top_k != 40:
        create_kwargs["extra_body"] = {"top_k": req.top_k}

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

    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': full_text}, ensure_ascii=False)}\n\n"


async def mock_generate(req: GenerateRequest) -> GenerateResponse:
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
        "choices": [{"index": 0, "message": {"role": "assistant", "content": base}, "finish_reason": "stop"}],
        "usage":   {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
    }

    return GenerateResponse(text=base, usage=usage, raw=raw, provider="mock")


async def mock_generate_stream(req: GenerateRequest):
    """Mock streaming for dev/no-key environments."""
    result = await mock_generate(req)
    words  = result.text.split(" ")
    for word in words:
        payload = json.dumps({"text": word + " ", "done": False}, ensure_ascii=False)
        yield f"data: {payload}\n\n"
        await asyncio.sleep(0.03)
    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': result.text}, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Refine prompt with LLM
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


async def refine_prompt_with_llm(prompt: str) -> dict:
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
