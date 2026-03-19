import math
import os
import re

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

import ml_classifier
from schemas.api import AnalyzeRequest, BehavioralMetrics, ScoreBreakdown

DEFAULT_EXPERT_REFERENCE_TEXT = (
    "API JSON LLM prompt engineering architecture backend frontend database SQL "
    "React Python machine learning optimization deployment рефакторинг асинхронність "
    "нейронні мережі transformer embedding fine-tuning RAG vector tokenizer attention "
    "inference neural network backpropagation gradient hyperparameter Docker Kubernetes "
    "CI/CD MLOps DevOps REST GraphQL WebSocket classification regression clustering NLP"
)


def _get_env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


EXPERT_REFERENCE_TEXT = (
    os.getenv("SCORING_EXPERT_REFERENCE_TEXT", DEFAULT_EXPERT_REFERENCE_TEXT).strip()
    or DEFAULT_EXPERT_REFERENCE_TEXT
)

MAX_SCORE = _get_env_float("SCORING_MAX_SCORE", 13.5)

PROMPT_LENGTH_MEDIUM_THRESHOLD = _get_env_int(
    "SCORING_PROMPT_LENGTH_MEDIUM_THRESHOLD",
    80,
)
PROMPT_LENGTH_LONG_THRESHOLD = _get_env_int(
    "SCORING_PROMPT_LENGTH_LONG_THRESHOLD",
    200,
)
WORD_COUNT_MEDIUM_THRESHOLD = _get_env_int(
    "SCORING_WORD_COUNT_MEDIUM_THRESHOLD",
    15,
)
WORD_COUNT_LONG_THRESHOLD = _get_env_int(
    "SCORING_WORD_COUNT_LONG_THRESHOLD",
    40,
)

SEMANTIC_LOW_THRESHOLD = _get_env_float("SCORING_SEMANTIC_LOW_THRESHOLD", 0.15)
SEMANTIC_MEDIUM_THRESHOLD = _get_env_float(
    "SCORING_SEMANTIC_MEDIUM_THRESHOLD",
    0.30,
)
SEMANTIC_HIGH_THRESHOLD = _get_env_float("SCORING_SEMANTIC_HIGH_THRESHOLD", 0.45)

TYPING_SPEED_THRESHOLD = _get_env_float("SCORING_TYPING_SPEED_THRESHOLD", 5.0)
TYPING_SPEED_CAP = _get_env_float("SCORING_TYPING_SPEED_CAP", 15.0)

SESSION_ACTIVITY_MEDIUM_THRESHOLD = _get_env_int(
    "SCORING_SESSION_ACTIVITY_MEDIUM_THRESHOLD",
    5,
)
SESSION_ACTIVITY_HIGH_THRESHOLD = _get_env_int(
    "SCORING_SESSION_ACTIVITY_HIGH_THRESHOLD",
    10,
)
AVG_PROMPT_LENGTH_THRESHOLD = _get_env_float(
    "SCORING_AVG_PROMPT_LENGTH_THRESHOLD",
    150.0,
)

ADVANCED_FEATURES_MEDIUM_THRESHOLD = _get_env_int(
    "SCORING_ADVANCED_FEATURES_MEDIUM_THRESHOLD",
    1,
)
ADVANCED_FEATURES_HIGH_THRESHOLD = _get_env_int(
    "SCORING_ADVANCED_FEATURES_HIGH_THRESHOLD",
    3,
)
SELF_SUFFICIENCY_MIN_MESSAGES = _get_env_int(
    "SCORING_SELF_SUFFICIENCY_MIN_MESSAGES",
    3,
)
POLITENESS_PENALTY = _get_env_float("SCORING_POLITENESS_PENALTY", -0.5)

ML_BLEND_MIN_CONFIDENCE = _get_env_float("SCORING_ML_BLEND_MIN_CONFIDENCE", 0.5)
ML_BLEND_BASE_WEIGHT = _get_env_float("SCORING_ML_BLEND_BASE_WEIGHT", 0.3)
ML_BLEND_REASON_DELTA = _get_env_float("SCORING_ML_BLEND_REASON_DELTA", 0.03)

L2_THRESHOLD = _get_env_float("L2_THRESHOLD", 0.25)
L3_THRESHOLD = _get_env_float("L3_THRESHOLD", 0.55)
if L2_THRESHOLD > L3_THRESHOLD:
    L2_THRESHOLD, L3_THRESHOLD = L3_THRESHOLD, L2_THRESHOLD


class SemanticAnalyzer:
    _instance: "SemanticAnalyzer | None" = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        self.reference_vector = self.model.encode([EXPERT_REFERENCE_TEXT])[0]
        self._initialized = True

    def calculate_semantic_tech_score(self, text: str) -> float:
        user_vector = self.model.encode([text])[0]
        similarity = cosine_similarity([user_vector], [self.reference_vector])[0][0]
        return round(max(0.0, float(similarity)), 3)


def get_semantic_score(text: str) -> float:
    return SemanticAnalyzer().calculate_semantic_tech_score(text)


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
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _has_role_pattern(text: str) -> bool:
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
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _has_format_requirement(text: str) -> bool:
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
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _has_politeness_words(text: str) -> bool:
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
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def compute_score(request: AnalyzeRequest):
    text = request.prompt_text.strip()
    metrics = request.metrics or BehavioralMetrics()
    reasons: list[str] = []
    breakdown: list[ScoreBreakdown] = []

    length = len(text)
    word_count = len(text.split())
    semantic_score = get_semantic_score(text)
    has_structure = has_structured_patterns(text)
    has_role = _has_role_pattern(text)
    has_format = _has_format_requirement(text)
    has_politeness = _has_politeness_words(text)

    score = 0.0

    pts = 0.0
    if length > PROMPT_LENGTH_LONG_THRESHOLD:
        pts = 2.0
        reasons.append(f"Long prompt ({length} chars)")
    elif length > PROMPT_LENGTH_MEDIUM_THRESHOLD:
        pts = 1.0
        reasons.append(f"Medium prompt ({length} chars)")
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Prompt Length",
            points=pts,
            max_points=2.0,
            detail=f"{length} characters",
        )
    )

    pts = 0.0
    if word_count > WORD_COUNT_LONG_THRESHOLD:
        pts = 1.5
        reasons.append(f"Detailed prompt ({word_count} words)")
    elif word_count > WORD_COUNT_MEDIUM_THRESHOLD:
        pts = 0.5
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Word Count",
            points=pts,
            max_points=1.5,
            detail=f"{word_count} words",
        )
    )

    pts = 0.0
    if semantic_score >= SEMANTIC_HIGH_THRESHOLD:
        pts = 3.0
        reasons.append(f"High semantic similarity ({semantic_score:.3f})")
    elif semantic_score >= SEMANTIC_MEDIUM_THRESHOLD:
        pts = 1.5
        reasons.append(f"Moderate semantic similarity ({semantic_score:.3f})")
    elif semantic_score >= SEMANTIC_LOW_THRESHOLD:
        pts = 0.5
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Technical Terms",
            points=pts,
            max_points=3.0,
            detail=f"semantic similarity score: {semantic_score:.3f}",
        )
    )

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
    breakdown.append(
        ScoreBreakdown(
            category="Structure & Context",
            points=pts,
            max_points=3.0,
            detail=", ".join(detail_parts) if detail_parts else "None",
        )
    )

    effective_speed = min(metrics.chars_per_second, TYPING_SPEED_CAP)
    pts = 1.0 if effective_speed > TYPING_SPEED_THRESHOLD else 0.0
    if pts > 0:
        reasons.append("Fast typing speed")
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Typing Speed",
            points=pts,
            max_points=1.0,
            detail=f"{metrics.chars_per_second:.1f} chars/sec (capped at {TYPING_SPEED_CAP:g})",
        )
    )

    pts = 0.0
    if metrics.session_message_count > SESSION_ACTIVITY_HIGH_THRESHOLD:
        pts = 1.0
        reasons.append("Experienced session (many messages)")
    elif metrics.session_message_count > SESSION_ACTIVITY_MEDIUM_THRESHOLD:
        pts = 0.5
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Session Activity",
            points=pts,
            max_points=1.0,
            detail=f"{metrics.session_message_count} messages",
        )
    )

    pts = 1.0 if metrics.avg_prompt_length > AVG_PROMPT_LENGTH_THRESHOLD else 0.0
    if pts > 0:
        reasons.append("Consistently long prompts")
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Avg Prompt Length",
            points=pts,
            max_points=1.0,
            detail=f"{metrics.avg_prompt_length:.0f} chars avg",
        )
    )

    advanced_features = getattr(metrics, "used_advanced_features_count", 0) or 0
    pts = 0.0
    if advanced_features >= ADVANCED_FEATURES_HIGH_THRESHOLD:
        pts = 2.0
        reasons.append(
            f"Active use of advanced features ({advanced_features} actions)"
        )
    elif advanced_features >= ADVANCED_FEATURES_MEDIUM_THRESHOLD:
        pts = 1.0
        reasons.append(
            f"Some advanced features used ({advanced_features} actions)"
        )
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Advanced Features",
            points=pts,
            max_points=2.0,
            detail=f"{advanced_features} advanced actions",
        )
    )

    pts = (
        0.5
        if metrics.tooltip_click_count == 0
        and metrics.session_message_count > SELF_SUFFICIENCY_MIN_MESSAGES
        else 0.0
    )
    score += pts
    breakdown.append(
        ScoreBreakdown(
            category="Self-sufficiency",
            points=pts,
            max_points=0.5,
            detail="No help needed" if pts > 0 else "Used hints",
        )
    )

    if has_politeness:
        score = max(0.0, score + POLITENESS_PENALTY)
        reasons.append(
            f"Conversational/Polite tone detected ({POLITENESS_PENALTY:+.1f} pts)"
        )
        breakdown.append(
            ScoreBreakdown(
                category="Politeness Penalty",
                points=POLITENESS_PENALTY,
                max_points=0.0,
                detail="Polite/conversational phrasing found",
            )
        )

    normalized = min(score / MAX_SCORE, 1.0)
    confidence = 1 - math.exp(-score / 3)

    if normalized >= L3_THRESHOLD:
        level = 3
    elif normalized >= L2_THRESHOLD:
        level = 2
    else:
        level = 1

    metrics_dict = {
        "chars_per_second": metrics.chars_per_second,
        "session_message_count": metrics.session_message_count,
        "avg_prompt_length": metrics.avg_prompt_length,
        "used_advanced_features_count": getattr(
            metrics,
            "used_advanced_features_count",
            0,
        ),
        "tooltip_click_count": getattr(metrics, "tooltip_click_count", 0),
    }
    ml_level, ml_conf = ml_classifier.ml_predict(
        text,
        metrics_dict,
        has_structure_fn=has_structured_patterns,
    )

    if ml_conf > ML_BLEND_MIN_CONFIDENCE:
        ml_normalized = (ml_level - 1) / 2.0
        ml_weight = ML_BLEND_BASE_WEIGHT * ml_conf
        blended = normalized * (1 - ml_weight) + ml_normalized * ml_weight
        if abs(blended - normalized) > ML_BLEND_REASON_DELTA:
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
        reasons.append("Simple short prompt - Guided mode recommended")

    return (
        level,
        round(confidence, 2),
        reasons,
        round(score, 2),
        round(normalized, 4),
        breakdown,
    )