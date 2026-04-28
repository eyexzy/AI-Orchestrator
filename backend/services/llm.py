import asyncio
import json
import logging
import os
import re
import time

from openai import AsyncOpenAI

from schemas.api import GenerateRequest, GenerateResponse, UsageStats

logger = logging.getLogger("ai-orchestrator")

# Only OpenRouter is used as the single provider
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


API_TIMEOUT     = _get_env_float("LLM_API_TIMEOUT", 90.0)
TUTOR_TIMEOUT   = _get_env_float("LLM_TUTOR_TIMEOUT", 90.0)
API_MAX_RETRIES = 0
AUTO_CONTINUE_MAX_PASSES = max(0, int(os.getenv("LLM_AUTO_CONTINUE_MAX_PASSES", "6")))
CONTINUE_PROMPT = (
    "Continue exactly from where you stopped. "
    "Do not repeat any previous text. "
    "Keep the same language, formatting, and structure. "
    "Output only the continuation."
)
AUTO_CONTINUE_FINISH_REASONS = {"length", "max_tokens"}


if OPENROUTER_API_KEY:
    clients["openrouter"] = AsyncOpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        timeout=API_TIMEOUT,
        max_retries=API_MAX_RETRIES,
        default_headers={
            "HTTP-Referer": os.getenv("APP_URL", "http://localhost:3000"),
            "X-Title": os.getenv("APP_NAME", "AI-Orchestrator"),
        },
    )
    logger.info("OpenRouter client initialized")

# ── Pricing (USD per 1M tokens) ─────────────────────────────────────────────
# [input_per_1m, output_per_1m]
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "anthropic/claude-sonnet-4-5":         (3.00,  15.00),
    "anthropic/claude-haiku-4-5-20251001": (0.80,   4.00),
    "openai/gpt-4o":                       (2.50,  10.00),
    "openai/gpt-4o-mini":                  (0.15,   0.60),
    "openai/o4-mini":                      (1.10,   4.40),
    "google/gemini-2.5-flash-preview":     (0.15,   0.60),
    "google/gemini-2.0-flash-001":         (0.10,   0.40),
    "google/gemini-2.5-pro-preview":       (1.25,  10.00),
}


def estimate_cost_usd(api_model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = MODEL_PRICING.get(api_model)
    if not pricing:
        return 0.0
    input_rate, output_rate = pricing
    return round((prompt_tokens * input_rate + completion_tokens * output_rate) / 1_000_000, 6)


# ── Model registry (all via OpenRouter) ────────────────────────────────────
# Paid models
AVAILABLE_MODELS: dict[str, dict] = {
    # Claude (Anthropic)
    "claude-sonnet-4-5":    {"provider": "openrouter", "label": "Claude Sonnet 4.5",    "api_name": "anthropic/claude-sonnet-4-5",         "vision": True,  "free": False, "context": 200000},
    "claude-haiku-4-5":     {"provider": "openrouter", "label": "Claude Haiku 4.5",     "api_name": "anthropic/claude-haiku-4-5-20251001", "vision": True,  "free": False, "context": 200000},
    # GPT (OpenAI)
    "gpt-4o":               {"provider": "openrouter", "label": "GPT-4o",               "api_name": "openai/gpt-4o",                       "vision": True,  "free": False, "context": 128000},
    "gpt-4o-mini":          {"provider": "openrouter", "label": "GPT-4o Mini",           "api_name": "openai/gpt-4o-mini",                  "vision": True,  "free": False, "context": 128000},
    "o4-mini":              {"provider": "openrouter", "label": "o4 Mini",               "api_name": "openai/o4-mini",                      "vision": True,  "free": False, "context": 128000},
    # Gemini (Google)
    "gemini-2.5-flash":     {"provider": "openrouter", "label": "Gemini 2.5 Flash",     "api_name": "google/gemini-2.5-flash-preview",     "vision": True,  "free": False, "context": 1000000},
    "gemini-2.0-flash":     {"provider": "openrouter", "label": "Gemini 2.0 Flash",     "api_name": "google/gemini-2.0-flash-001",         "vision": True,  "free": False, "context": 1000000},
    "gemini-2.5-pro":       {"provider": "openrouter", "label": "Gemini 2.5 Pro",       "api_name": "google/gemini-2.5-pro-preview",       "vision": True,  "free": False, "context": 1000000},
    # Free models
    "or-llama-70b":         {"provider": "openrouter", "label": "Llama 3.3 70B",        "api_name": "meta-llama/llama-3.3-70b-instruct:free",         "vision": False, "free": True, "context": 131072},
    "or-deepseek-r1":       {"provider": "openrouter", "label": "DeepSeek R1",           "api_name": "deepseek/deepseek-r1:free",                      "vision": False, "free": True, "context": 163840},
    "or-gemma-3-27b":       {"provider": "openrouter", "label": "Gemma 3 27B",           "api_name": "google/gemma-3-27b-it:free",                     "vision": True,  "free": True, "context": 131072},
    "or-qwen3-30b":         {"provider": "openrouter", "label": "Qwen3 30B",             "api_name": "qwen/qwen3-30b-a3b:free",                        "vision": False, "free": True, "context": 40960},
    "or-mistral-small":     {"provider": "openrouter", "label": "Mistral Small 3.1",     "api_name": "mistralai/mistral-small-3.1-24b-instruct:free",  "vision": False, "free": True, "context": 131072},
    "or-llama-scout":       {"provider": "openrouter", "label": "Llama 4 Scout",         "api_name": "meta-llama/llama-4-scout:free",                  "vision": True,  "free": True, "context": 10000000},
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



_TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".rst", ".csv", ".tsv",
    ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env",
    ".xml", ".html", ".htm", ".svg",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs",
    ".java", ".kt", ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".rb", ".php", ".swift", ".scala", ".sh", ".bash", ".zsh",
    ".sql", ".graphql", ".proto", ".css", ".scss", ".less",
    ".log", ".diff", ".patch", ".tex", ".bib",
}


def _extract_inline_text(raw: bytes, mime: str, filename: str) -> str:
    """Extract readable text from raw bytes for injection into LLM context."""
    import base64 as _b64
    from pathlib import Path

    ext = Path(filename).suffix.lower()

    # PDF — use pymupdf
    if mime == "application/pdf" or ext == ".pdf":
        try:
            import fitz  # type: ignore[import]
            doc = fitz.open(stream=raw, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            return text
        except ImportError:
            return "(PDF text extraction unavailable — install pymupdf)"
        except Exception as exc:
            return f"(PDF extraction failed: {exc})"

    # Word .docx
    if ext == ".docx" or "wordprocessingml" in mime:
        try:
            import docx, io  # type: ignore[import]
            doc = docx.Document(io.BytesIO(raw))
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            return "(DOCX extraction unavailable — install python-docx)"
        except Exception as exc:
            return f"(DOCX extraction failed: {exc})"

    # Excel .xlsx
    if ext in (".xlsx", ".xls") or "spreadsheetml" in mime or mime == "application/vnd.ms-excel":
        try:
            import openpyxl, io  # type: ignore[import]
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
            parts: list[str] = []
            for sheet in wb.worksheets:
                parts.append(f"[Sheet: {sheet.title}]")
                for row in sheet.iter_rows(values_only=True):
                    row_str = "\t".join("" if v is None else str(v) for v in row)
                    if row_str.strip():
                        parts.append(row_str)
            wb.close()
            return "\n".join(parts)
        except ImportError:
            return "(XLSX extraction unavailable — install openpyxl)"
        except Exception as exc:
            return f"(XLSX extraction failed: {exc})"

    # Plain text / code
    if mime.startswith("text/") or ext in _TEXT_EXTENSIONS:
        return raw.decode("utf-8", errors="replace")

    # Unknown binary — try UTF-8, check printability
    try:
        text = raw.decode("utf-8", errors="strict")
        ratio = sum(1 for c in text if c.isprintable() or c in "\n\r\t") / max(len(text), 1)
        if ratio > 0.85:
            return text
    except UnicodeDecodeError:
        pass

    return "(binary file — no text content extractable)"


def _build_user_content(prompt: str, req: GenerateRequest, vision_supported: bool = True) -> str | list:
    """
    Build the user message content.
    - Images on vision models: sent as image_url blocks (OpenAI vision format).
    - Images on non-vision models: replaced with a text placeholder.
    - All other files (PDF, DOCX, XLSX, text, code, …): text extracted and injected as text blocks.
    """
    import base64

    attachments = req.inline_attachments if req.inline_attachments else []
    if not attachments:
        return prompt

    parts: list[dict] = []

    for att in attachments:
        mime = att.mime_type.lower()
        raw = base64.b64decode(att.data)

        if mime.startswith("image/"):
            if vision_supported:
                parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{att.mime_type};base64,{att.data}"},
                })
            else:
                parts.append({
                    "type": "text",
                    "text": f"[Image attached: {att.filename} — this model does not support image input]",
                })
        else:
            text = _extract_inline_text(raw, mime, att.filename)
            if len(text) > 24_000:
                text = text[:24_000] + "\n... [truncated — file too large]"
            parts.append({"type": "text", "text": f"[File: {att.filename}]\n{text.strip()}"})

    parts.append({"type": "text", "text": prompt})

    # Collapse to plain string when no vision blocks present (maximises model compat)
    if not any(p.get("type") == "image_url" for p in parts):
        return "\n\n".join(
            p["text"] for p in parts if p.get("type") == "text" and p.get("text")
        )

    return parts


def build_messages(req: GenerateRequest, vision_supported: bool = True) -> list[dict]:
    """Build the full messages array including conversation history."""
    messages: list[dict] = []

    if req.system_message.strip():
        messages.append({"role": "system", "content": req.system_message.strip()})

    history = req.history[-req.history_limit:] if req.history_limit > 0 else []
    for h in history:
        if h.role in ("user", "assistant") and h.content.strip():
            messages.append({"role": h.role, "content": h.content})

    if req.continuation_text.strip():
        messages.append({"role": "assistant", "content": req.continuation_text})
        messages.append({"role": "user", "content": CONTINUE_PROMPT})
    else:
        messages.append({"role": "user", "content": _build_user_content(req.prompt, req, vision_supported)})
    return messages


def _build_continuation_messages(base_messages: list[dict], partial_text: str) -> list[dict]:
    return [
        *base_messages,
        {"role": "assistant", "content": partial_text},
        {"role": "user", "content": CONTINUE_PROMPT},
    ]


def _merge_continuation_text(existing: str, addition: str) -> str:
    if not existing:
        return addition
    if not addition:
        return existing
    if addition in existing:
        return existing

    max_overlap = min(len(existing), len(addition), 200)
    for overlap in range(max_overlap, 0, -1):
        if existing[-overlap:] == addition[:overlap]:
            return existing + addition[overlap:]
    return existing + addition


def _looks_truncated(text: str) -> bool:
    stripped = text.rstrip()
    if not stripped:
        return False

    if stripped.count("```") % 2 == 1:
        return True

    if stripped.endswith(("...", "…", ":", ";", ",", "(", "[", "{", "-", "—", "–", "/", "\\")):
        return True

    if re.search(r"(^|\n)(?:[-*]|\d+\.)\s+[^\n]*$", stripped):
        return True

    return stripped[-1].isalnum()


def _should_auto_continue(
    *,
    finish_reason: str | None,
    text: str,
    max_tokens: int,
    completion_tokens: int | None = None,
) -> bool:
    if not text.strip():
        return False

    normalized_reason = (finish_reason or "").strip().lower()
    if normalized_reason in AUTO_CONTINUE_FINISH_REASONS:
        return True

    token_count = completion_tokens if completion_tokens is not None else estimate_tokens(text)
    near_limit = token_count >= max(32, int(max_tokens * 0.9))
    return near_limit and _looks_truncated(text)




async def real_generate(client: AsyncOpenAI, model_info: dict, req: GenerateRequest) -> GenerateResponse:
    """Call any OpenAI-compatible API with full conversation history."""
    base_messages  = build_messages(req, vision_supported=model_info.get("vision", False))
    api_model = model_info["api_name"]
    provider  = model_info["provider"]
    request_client = client.with_options(timeout=None)
    current_messages = base_messages
    full_text = ""
    total_prompt_tokens = 0
    total_completion_tokens = 0
    raw_passes: list[dict] = []
    last_finish_reason: str | None = None
    truncated = False

    start = time.time()

    for pass_index in range(AUTO_CONTINUE_MAX_PASSES + 1):
        create_kwargs: dict = {
            "model":       api_model,
            "messages":    current_messages,
            "temperature": req.temperature,
            "max_tokens":  req.max_tokens,
            "top_p":       req.top_p,
        }

        response = await request_client.chat.completions.create(**create_kwargs)
        text = response.choices[0].message.content or ""
        full_text = _merge_continuation_text(full_text, text)
        last_finish_reason = response.choices[0].finish_reason if response.choices else None
        usage_data = response.usage

        total_prompt_tokens += (
            usage_data.prompt_tokens
            if usage_data and usage_data.prompt_tokens is not None
            else estimate_tokens(current_messages[-1]["content"] if current_messages else req.prompt)
        )
        total_completion_tokens += (
            usage_data.completion_tokens
            if usage_data and usage_data.completion_tokens is not None
            else estimate_tokens(text)
        )

        try:
            raw_passes.append(response.model_dump())
        except Exception:
            raw_passes.append({
                "model": api_model,
                "choices": [{
                    "message": {"content": text},
                    "finish_reason": last_finish_reason,
                }],
                "usage": {
                    "prompt_tokens": usage_data.prompt_tokens if usage_data else None,
                    "completion_tokens": usage_data.completion_tokens if usage_data else None,
                },
            })

        completion_tokens = (
            usage_data.completion_tokens
            if usage_data and usage_data.completion_tokens is not None
            else estimate_tokens(text)
        )

        should_continue = _should_auto_continue(
            finish_reason=last_finish_reason,
            text=text,
            max_tokens=req.max_tokens,
            completion_tokens=completion_tokens,
        )
        if not should_continue:
            break

        if pass_index >= AUTO_CONTINUE_MAX_PASSES:
            truncated = True
            break

        logger.info(
            "[generate] auto_continue",
            extra={
                "provider": provider,
                "model": api_model,
                "pass_index": pass_index + 1,
            },
        )
        current_messages = _build_continuation_messages(base_messages, full_text)

    latency = int((time.time() - start) * 1000)
    prompt_tok = total_prompt_tokens or estimate_tokens(req.prompt)
    completion_tok = total_completion_tokens or estimate_tokens(full_text)
    total_tokens = prompt_tok + completion_tok
    cost_usd = estimate_cost_usd(api_model, prompt_tok, completion_tok)

    usage = UsageStats(
        prompt_tokens=prompt_tok,
        completion_tokens=completion_tok,
        total_tokens=total_tokens,
        model=api_model,
        temperature=req.temperature,
        latency_ms=latency,
    )

    raw = {
        "model": api_model,
        "passes": raw_passes,
        "finish_reason": last_finish_reason,
        "continued_passes": max(0, len(raw_passes) - 1),
        "truncated": truncated,
        "usage": {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "total_tokens": usage.total_tokens,
            "cost_usd": cost_usd,
        },
    }

    return GenerateResponse(text=full_text, usage=usage, raw=raw, provider=provider)


async def real_generate_stream(client: AsyncOpenAI, model_info: dict, req: GenerateRequest):
    """Streaming generator - yields SSE-formatted chunks."""
    base_messages = build_messages(req, vision_supported=model_info.get("vision", False))
    api_model = model_info["api_name"]
    request_client = client.with_options(timeout=None)

    full_text = ""
    last_finish_reason: str | None = None
    truncated = False
    continued_passes = 0
    try:
        current_messages = base_messages

        for pass_index in range(AUTO_CONTINUE_MAX_PASSES + 1):
            create_kwargs: dict = {
                "model": api_model,
                "messages": current_messages,
                "temperature": req.temperature,
                "max_tokens": req.max_tokens,
                "top_p": req.top_p,
                "stream": True,
            }

            pass_text = ""
            last_finish_reason = None

            async for chunk in await request_client.chat.completions.create(**create_kwargs):
                choice = chunk.choices[0] if chunk.choices else None
                if choice and choice.finish_reason:
                    last_finish_reason = choice.finish_reason

                delta = choice.delta.content if choice else None
                if not delta:
                    continue

                pass_text += delta
                if pass_index == 0:
                    full_text += delta
                    payload = json.dumps({"text": delta, "done": False}, ensure_ascii=False)
                    yield f"data: {payload}\n\n"

            if pass_index > 0 and pass_text:
                merged_text = _merge_continuation_text(full_text, pass_text)
                addition = merged_text[len(full_text):]
                full_text = merged_text

                if addition:
                    for index in range(0, len(addition), 160):
                        payload = json.dumps(
                            {"text": addition[index:index + 160], "done": False},
                            ensure_ascii=False,
                        )
                        yield f"data: {payload}\n\n"

            should_continue = _should_auto_continue(
                finish_reason=last_finish_reason,
                text=pass_text,
                max_tokens=req.max_tokens,
                completion_tokens=estimate_tokens(pass_text),
            )
            if not should_continue:
                break

            if pass_index >= AUTO_CONTINUE_MAX_PASSES:
                truncated = True
                break

            logger.info(
                "[stream] auto_continue",
                extra={
                    "provider": model_info["provider"],
                    "model": api_model,
                    "pass_index": pass_index + 1,
                },
            )
            continued_passes += 1
            current_messages = _build_continuation_messages(base_messages, full_text)
    except Exception as e:
        logger.error(f"[stream] Error: {e}")
        # Re-raise with structured info so caller can send a clean error_code
        try:
            from openai import APIStatusError
            if isinstance(e, APIStatusError):
                raise RuntimeError(f"provider_http_{e.status_code}") from e
        except ImportError:
            pass
        raise

    yield f"data: {json.dumps({'text': '', 'done': True, 'full_text': full_text, 'finish_reason': last_finish_reason, 'continued_passes': continued_passes, 'truncated': truncated}, ensure_ascii=False)}\n\n"


def _has_real_api_keys() -> bool:
    return bool(OPENROUTER_API_KEY)


# Refine prompt with LLM
LEVEL_GUIDANCE = {
    1: """USER LEVEL: Beginner (L1)
- Use warm, plain language — no jargon.
- Identify the single biggest gap and explain WHY it matters in one sentence.
- Ask one concrete clarifying question a first-timer would actually understand.
- The improved prompt should feel natural, not over-engineered.
- strengths: find something genuine even in a weak prompt — this builds confidence.""",

    2: """USER LEVEL: Intermediate (L2)
- Be direct and practical, skip basics.
- Diagnose gaps in: task specificity, context, output format, success criteria.
- Ask one question that sharpens scope or removes ambiguity.
- The improved prompt should demonstrate proper structure without overloading it.
- why_this_is_better: explain the reasoning behind each structural choice.""",

    3: """USER LEVEL: Advanced (L3)
- Be concise and peer-level — no handholding.
- Hunt for: hidden assumptions, missing constraints, vague evaluation criteria, underspecified output.
- Ask one question about non-obvious edge cases or success metrics.
- The improved prompt should be precise, minimal, and production-ready.
- why_this_is_better: focus on the subtle but high-impact changes only.""",
}

PROMPT_TUTOR_SYSTEM = """You are an expert prompt engineering coach embedded in an AI tool. Your job is to make the user's prompt significantly more effective — and teach them why.

{level_guidance}

## Your analysis framework
Evaluate the prompt across these dimensions (only flag what's actually missing):
1. TASK — Is the core request unambiguous? Does it specify the action verb clearly?
2. CONTEXT — Does the model have enough background to avoid wrong assumptions?
3. OUTPUT — Is the desired format, length, tone, or structure specified?
4. AUDIENCE — Who is this for? Does the response need to be adapted?
5. CONSTRAINTS — What should the model NOT do? Any hard limits?

## Rules
- Respond ONLY in {response_language}. Every field must be in this language.
- Output ONLY raw JSON — no markdown fences, no explanation outside the JSON.
- opening_message: 1-2 sentences. Acknowledge what works, name the most critical gap.
- strengths: 1-2 items. Be specific — "clear verb" not "good start".
- gaps: 1-2 items. Name the dimension (Task/Context/Output/Audience/Constraint) and the specific issue.
- clarifying_questions: ask as many questions as genuinely needed — 0 if the prompt is already clear enough, up to 5 if critical information is missing. Each must be answerable in one sentence and directly unlock a better improved_prompt. Format: {{"id": "q1", "question": "..."}}. Do not pad with questions just to have some.
- improved_prompt: rewrite the prompt applying the gaps you found. Preserve the user's intent and voice. Do not add unnecessary structure, roles, or jargon. The improvement should feel obvious in hindsight.
- why_this_is_better: 2-3 items. Each explains one specific structural change and its effect on output quality.

## Anti-patterns to avoid
- Do not suggest temperature, top-p, system prompts, variables, or any UI controls.
- Do not pad the improved_prompt with generic phrases like "As an expert..." unless role is genuinely needed.
- Do not repeat the gap diagnosis verbatim in why_this_is_better.
- Do not generate a worse prompt just to seem different.

Output schema (strict — no extra keys):
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
  "why_this_is_better": ["string"]
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
    gaps = [str(g).strip() for g in parsed.get("gaps", []) if str(g).strip()][:3]

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
    questions = questions[:5]  # hard cap to prevent runaway

    improved = str(parsed.get("improved_prompt", "")).strip()
    why_better = [str(w).strip() for w in parsed.get("why_this_is_better", []) if str(w).strip()][:3]

    if not improved or len(improved) < 10:
        raise ValueError("low_quality_response: improved_prompt too short")

    return {
        "opening_message": opening,
        "strengths": strengths,
        "gaps": gaps,
        "clarifying_questions": questions,
        "improved_prompt": improved,
        "why_this_is_better": why_better,
        "next_step": "",
    }


def _iter_tutor_candidates() -> list[tuple[AsyncOpenAI, dict]]:
    """
    Ordered list of (client, model_info) for tutor fallback chain.
    Claude Haiku first (best JSON instruction-following at low cost),
    then paid models, then free models as last resort.
    """
    preferred_models = [
        "claude-haiku-4-5",    # primary: fast, excellent JSON, great for coaching
        "claude-sonnet-4-5",   # fallback 1: stronger reasoning
        "gemini-2.0-flash",    # fallback 2: fast and reliable
        "gpt-4o-mini",         # fallback 3
        "or-llama-70b",        # fallback 4: free
        "or-mistral-small",    # fallback 5: free
        "or-gemma-3-27b",      # fallback 6: free
    ]
    seen: set[str] = set()
    candidates: list[tuple[AsyncOpenAI, dict]] = []

    for model_id in preferred_models:
        info = AVAILABLE_MODELS.get(model_id)
        if not info:
            continue
        client = clients.get(info["provider"])
        if not client:
            continue
        candidates.append((client, info))
        seen.add(model_id)

    # Append any remaining available models not already in the list
    for model_id, info in AVAILABLE_MODELS.items():
        if model_id in seen:
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

        # OpenRouter supports json_object for Claude and GPT models
        if "anthropic/" in api_model or "openai/" in api_model:
            create_kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(**create_kwargs),
                timeout=TUTOR_TIMEOUT,
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
