import json
import math
import re

import ml_classifier
from schemas.api import AnalyzeRequest, BehavioralMetrics, ScoreBreakdown

# ---------------------------------------------------------------------------
# Technical terms dictionary
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


def count_technical_terms(text: str) -> int:
    lower = text.lower()
    return sum(1 for term in TECHNICAL_TERMS if term in lower)


def has_structured_patterns(text: str) -> bool:
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
# Semantic analysis helpers
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

MAX_SCORE    = 13.5
L2_THRESHOLD = 0.25
L3_THRESHOLD = 0.55


def compute_score(request: AnalyzeRequest):
    text    = request.prompt_text.strip()
    metrics = request.metrics or BehavioralMetrics()
    reasons: list[str]         = []
    breakdown: list[ScoreBreakdown] = []

    length     = len(text)
    word_count = len(text.split())
    tech_count = count_technical_terms(text)
    has_structure = has_structured_patterns(text)
    has_role      = _has_role_pattern(text)
    has_format    = _has_format_requirement(text)
    has_politeness = _has_politeness_words(text)

    score = 0.0

    # ── Prompt Length (max 2.0) ───────────────────────────────────────────────
    pts = 0.0
    if length > 200:
        pts = 2.0; reasons.append(f"Long prompt ({length} chars)")
    elif length > 80:
        pts = 1.0; reasons.append(f"Medium prompt ({length} chars)")
    score += pts
    breakdown.append(ScoreBreakdown(category="Prompt Length", points=pts, max_points=2.0, detail=f"{length} characters"))

    # ── Word Count (max 1.5) ─────────────────────────────────────────────────
    pts = 0.0
    if word_count > 40:
        pts = 1.5; reasons.append(f"Detailed prompt ({word_count} words)")
    elif word_count > 15:
        pts = 0.5
    score += pts
    breakdown.append(ScoreBreakdown(category="Word Count", points=pts, max_points=1.5, detail=f"{word_count} words"))

    # ── Technical Terms (max 3.0) ────────────────────────────────────────────
    pts = 0.0
    if tech_count >= 4:
        pts = 3.0; reasons.append(f"Heavy technical vocabulary ({tech_count} terms)")
    elif tech_count >= 2:
        pts = 1.5; reasons.append(f"Some technical terms ({tech_count})")
    elif tech_count >= 1:
        pts = 0.5
    score += pts
    breakdown.append(ScoreBreakdown(category="Technical Terms", points=pts, max_points=3.0, detail=f"{tech_count} recognized terms"))

    # ── Structure & Context (max 3.0) ────────────────────────────────────────
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

    # ── Typing Speed (max 1.0) ───────────────────────────────────────────────
    effective_speed = min(metrics.chars_per_second, 15.0)
    pts = 1.0 if effective_speed > 5 else 0.0
    if pts > 0: reasons.append("Fast typing speed")
    score += pts
    breakdown.append(ScoreBreakdown(category="Typing Speed", points=pts, max_points=1.0, detail=f"{metrics.chars_per_second:.1f} chars/sec (capped at 15)"))

    # ── Session Activity (max 1.0) ───────────────────────────────────────────
    pts = 0.0
    if metrics.session_message_count > 10:
        pts = 1.0; reasons.append("Experienced session (many messages)")
    elif metrics.session_message_count > 5:
        pts = 0.5
    score += pts
    breakdown.append(ScoreBreakdown(category="Session Activity", points=pts, max_points=1.0, detail=f"{metrics.session_message_count} messages"))

    # ── Avg Prompt Length (max 1.0) ──────────────────────────────────────────
    pts = 1.0 if metrics.avg_prompt_length > 150 else 0.0
    if pts > 0: reasons.append("Consistently long prompts")
    score += pts
    breakdown.append(ScoreBreakdown(category="Avg Prompt Length", points=pts, max_points=1.0, detail=f"{metrics.avg_prompt_length:.0f} chars avg"))

    # ── Advanced Features (max 2.0) ──────────────────────────────────────────
    adv = getattr(metrics, "used_advanced_features_count", 0) or 0
    pts = 0.0
    if adv >= 3:
        pts = 2.0; reasons.append(f"Active use of advanced features ({adv} actions)")
    elif adv >= 1:
        pts = 1.0; reasons.append(f"Some advanced features used ({adv} actions)")
    score += pts
    breakdown.append(ScoreBreakdown(category="Advanced Features", points=pts, max_points=2.0, detail=f"{adv} advanced actions"))

    # ── Self-sufficiency (max 0.5) ───────────────────────────────────────────
    pts = 0.5 if metrics.tooltip_click_count == 0 and metrics.session_message_count > 3 else 0.0
    score += pts
    breakdown.append(ScoreBreakdown(category="Self-sufficiency", points=pts, max_points=0.5, detail="No help needed" if pts > 0 else "Used hints"))

    # ── Politeness penalty (-0.5) ────────────────────────────────────────────
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

    # ── Normalize & determine level ──────────────────────────────────────────
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
    ml_level, ml_conf = ml_classifier.ml_predict(text, metrics_dict, count_technical_terms, has_structured_patterns)

    # ── ML blending ──────────────────────────────────────────────────────────
    if ml_conf > 0.5:
        ml_normalized = (ml_level - 1) / 2.0
        ml_weight = 0.3 * ml_conf
        blended = normalized * (1 - ml_weight) + ml_normalized * ml_weight
        if abs(blended - normalized) > 0.03:
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
