"""
Rule Engine V3 — 5-block behavioral scoring system.

Scoring philosophy: every rule measures *user experience with AI chat tools*,
not domain knowledge or topic technicality.  The three concepts are kept separate:

  - "prompt quality"       = how well a prompt is crafted (specificity, constraints)
  - "domain technicality"  = subject area of the prompt (NOT scored)
  - "experience level"     = how effectively the user operates the AI interface

Blocks (each 0–3 max, total max = 15):
  1. Prompt Craftsmanship — length, specificity, structure, context-setting
  2. Tool Mastery         — advanced features, system prompt, variables
  3. Autonomy             — self-sufficiency, low cancel/help ratios
  4. Efficiency           — typing speed, session activity, prompt consistency
  5. Stability            — rolling user aggregates from session history

Penalties reduce score but never below 0.
ML blending adjusts the final normalized score.
"""

import logging
import math
import os
import re

# Force offline mode BEFORE importing sentence_transformers / transformers.
# This prevents any user request from triggering a network download.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

from sklearn.metrics.pairwise import cosine_similarity

import ml_classifier
from schemas.api import AnalyzeRequest, BehavioralMetrics, ScoreBreakdown

logger = logging.getLogger("ai-orchestrator")

# Configuration helpers

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


# Block max points
BLOCK_MAX = 3.0
MAX_SCORE = BLOCK_MAX * 5  # 15.0

# Prompt Craftsmanship thresholds
PROMPT_LENGTH_MEDIUM = _get_env_int("SCORING_PROMPT_LENGTH_MEDIUM_THRESHOLD", 80)
PROMPT_LENGTH_LONG = _get_env_int("SCORING_PROMPT_LENGTH_LONG_THRESHOLD", 200)
WORD_COUNT_MEDIUM = _get_env_int("SCORING_WORD_COUNT_MEDIUM_THRESHOLD", 15)
WORD_COUNT_LONG = _get_env_int("SCORING_WORD_COUNT_LONG_THRESHOLD", 40)

# Efficiency thresholds
TYPING_SPEED_THRESHOLD = _get_env_float("SCORING_TYPING_SPEED_THRESHOLD", 5.0)
TYPING_SPEED_CAP = _get_env_float("SCORING_TYPING_SPEED_CAP", 15.0)
SESSION_ACTIVITY_MEDIUM = _get_env_int("SCORING_SESSION_ACTIVITY_MEDIUM_THRESHOLD", 5)
SESSION_ACTIVITY_HIGH = _get_env_int("SCORING_SESSION_ACTIVITY_HIGH_THRESHOLD", 10)
AVG_PROMPT_LENGTH_THRESHOLD = _get_env_float("SCORING_AVG_PROMPT_LENGTH_THRESHOLD", 150.0)

# Tool Mastery thresholds
ADVANCED_MEDIUM = _get_env_int("SCORING_ADVANCED_FEATURES_MEDIUM_THRESHOLD", 1)
ADVANCED_HIGH = _get_env_int("SCORING_ADVANCED_FEATURES_HIGH_THRESHOLD", 3)

# Autonomy thresholds
SELF_SUFFICIENCY_MIN_MESSAGES = _get_env_int("SCORING_SELF_SUFFICIENCY_MIN_MESSAGES", 3)

# Penalty weights (behavioral signals only — no content-based penalties)
HIGH_CANCEL_RATE_THRESHOLD = _get_env_float("SCORING_HIGH_CANCEL_RATE_THRESHOLD", 0.3)
HIGH_CANCEL_PENALTY = _get_env_float("SCORING_HIGH_CANCEL_PENALTY", -0.5)
HIGH_HELP_RATIO_THRESHOLD = _get_env_float("SCORING_HIGH_HELP_RATIO_THRESHOLD", 0.5)
HIGH_HELP_PENALTY = _get_env_float("SCORING_HIGH_HELP_PENALTY", -0.5)

# ML blending
ML_BLEND_MIN_CONFIDENCE = _get_env_float("SCORING_ML_BLEND_MIN_CONFIDENCE", 0.5)
ML_BLEND_BASE_WEIGHT = _get_env_float("SCORING_ML_BLEND_BASE_WEIGHT", 0.3)
ML_BLEND_REASON_DELTA = _get_env_float("SCORING_ML_BLEND_REASON_DELTA", 0.03)

# Level thresholds
L2_THRESHOLD = _get_env_float("L2_THRESHOLD", 0.25)
L3_THRESHOLD = _get_env_float("L3_THRESHOLD", 0.55)
if L2_THRESHOLD > L3_THRESHOLD:
    L2_THRESHOLD, L3_THRESHOLD = L3_THRESHOLD, L2_THRESHOLD


# Semantic model — kept for ML feature extraction (ml_classifier.extract_features),
# but NO LONGER used in rule-based scoring.  Rule scoring is now topic-agnostic.

# Legacy expert reference text — only used by ml_classifier backward compat path.
DEFAULT_EXPERT_REFERENCE_TEXT = (
    "API JSON LLM prompt engineering architecture backend frontend database SQL "
    "React Python machine learning optimization deployment"
)
EXPERT_REFERENCE_TEXT = (
    os.getenv("SCORING_EXPERT_REFERENCE_TEXT", DEFAULT_EXPERT_REFERENCE_TEXT).strip()
    or DEFAULT_EXPERT_REFERENCE_TEXT
)

_semantic_model = None # SentenceTransformer instance or None
_reference_vector = None # Pre-encoded expert reference
_semantic_available: bool = False


def warmup_semantic_model() -> bool:
    """Load the SentenceTransformer model from local cache (offline-only).

    Call this once during app startup (lifespan).
    Returns True if model loaded, False if unavailable (graceful degradation).
    The model is used by ml_classifier feature extraction, NOT by rule scoring.
    """
    global _semantic_model, _reference_vector, _semantic_available

    if _semantic_available:
        return True

    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        ref_vec = model.encode([EXPERT_REFERENCE_TEXT])[0]

        _semantic_model = model
        _reference_vector = ref_vec
        _semantic_available = True
        logger.info(
            "[semantic] model_loaded",
            extra={"model": "paraphrase-multilingual-MiniLM-L12-v2", "status": "ok"},
        )
        return True
    except Exception as exc:
        _semantic_available = False
        logger.warning(
            "[semantic] model_unavailable — get_semantic_score will return 0.0. "
            "To enable, download the model into the HuggingFace cache: "
            "python -c \"from sentence_transformers import SentenceTransformer; "
            "SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')\"",
            extra={"error": f"{type(exc).__name__}: {exc}"},
        )
        return False


def get_semantic_score(text: str) -> float:
    """Return semantic similarity to expert reference text.

    Used ONLY by ml_classifier feature extraction for backward compat.
    NOT used in rule-based scoring (rule scoring is topic-agnostic).
    Returns 0.0 if model is not available.
    """
    if not _semantic_available:
        return 0.0
    user_vector = _semantic_model.encode([text])[0]
    similarity = cosine_similarity([user_vector], [_reference_vector])[0][0]
    return round(max(0.0, float(similarity)), 3)


# Text analysis helpers (kept public for aggregation pipeline)

def _count_specificity_signals(text: str) -> int:
    """Count topic-agnostic prompt specificity signals.

    These measure *prompt engineering skill* — how well the user constrains
    and specifies the task — regardless of what domain the prompt is about.
    A cookbook author and a software engineer both score high if they write
    specific, well-constrained prompts.
    """
    signals = [
        # Constraints: the user sets explicit boundaries
        r"(?:не більше|не менше|максимум|мінімум|обмеж|exactly|at most|at least|no more than|limit)",
        # Examples / few-shot: the user provides concrete examples
        r"(?:наприклад|приклад|for example|e\.g\.|such as|like this|here is an example)",
        # Explicit output format: the user specifies how the result should look
        r"(?:у форматі|поверни|output|return|respond with|give me|provide|format as|as a list|as a table)",
        # Numbered requirements / multi-step instructions
        r"(?:^|\n)\s*\d+[\.\)]\s",
        # Audience / context specification
        r"(?:для\s+(?:початківців|експертів|дітей|студентів)|for\s+(?:beginners|experts|children|students)|target audience|audience is)",
        # Tone/style constraints
        r"(?:тон|стиль|formal|informal|concise|detailed|brief|tone|style|voice)",
        # Negative constraints: what NOT to do
        r"(?:не використовуй|не включай|без|уникай|don'?t\s+(?:use|include|mention)|avoid|without|exclude|do not)",
        # Length / scope constraints
        r"(?:коротко|детально|стисло|розгорнуто|in\s+\d+\s+(?:words|sentences|paragraphs)|briefly|in detail|summarize)",
    ]
    count = 0
    lower = text.lower()
    for pattern in signals:
        if re.search(pattern, lower, re.IGNORECASE | re.MULTILINE):
            count += 1
    return count


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


# Block 1: Prompt Craftsmanship (max 3.0)

def _score_prompt_craftsmanship(
    text: str,
    reasons: list[str],
) -> tuple[float, list[ScoreBreakdown]]:
    breakdown: list[ScoreBreakdown] = []
    length = len(text)
    word_count = len(text.split())
    specificity = _count_specificity_signals(text)
    has_structure = has_structured_patterns(text)
    has_role = _has_role_pattern(text)
    has_format = _has_format_requirement(text)

    # Length sub-score (0–0.75)
    # UX rationale: experienced users provide more context to the AI.
    len_pts = 0.0
    if length > PROMPT_LENGTH_LONG:
        len_pts = 0.75
    elif length > PROMPT_LENGTH_MEDIUM:
        len_pts = 0.4
    breakdown.append(ScoreBreakdown(
        category="PC: Prompt Length",
        points=round(len_pts, 2), max_points=0.75,
        detail=f"{length} chars",
    ))

    # Word count sub-score (0–0.5)
    # UX rationale: detailed prompts correlate with intentional AI usage.
    wc_pts = 0.0
    if word_count > WORD_COUNT_LONG:
        wc_pts = 0.5
        reasons.append(f"Detailed prompt ({word_count} words)")
    elif word_count > WORD_COUNT_MEDIUM:
        wc_pts = 0.25
    breakdown.append(ScoreBreakdown(
        category="PC: Word Count",
        points=round(wc_pts, 2), max_points=0.5,
        detail=f"{word_count} words",
    ))

    spec_pts = 0.0
    if specificity >= 4:
        spec_pts = 1.0
        reasons.append(f"Highly specific prompt ({specificity} constraint signals)")
    elif specificity >= 2:
        spec_pts = 0.5
        reasons.append(f"Moderately specific prompt ({specificity} constraint signals)")
    elif specificity >= 1:
        spec_pts = 0.2
    breakdown.append(ScoreBreakdown(
        category="PC: Prompt Specificity",
        points=round(spec_pts, 2), max_points=1.0,
        detail=f"{specificity} specificity signals",
    ))

    struct_pts = 0.0
    struct_parts: list[str] = []
    if has_structure:
        struct_pts += 0.25
        struct_parts.append("structured patterns")
    if has_role:
        struct_pts += 0.25
        struct_parts.append("role assignment")
    if has_format:
        struct_pts += 0.25
        struct_parts.append("format requirement")
    if struct_parts:
        reasons.append(f"Structure detected: {', '.join(struct_parts)}")
    breakdown.append(ScoreBreakdown(
        category="PC: Structure & Context",
        points=round(struct_pts, 2), max_points=0.75,
        detail=", ".join(struct_parts) if struct_parts else "None",
    ))

    total = min(len_pts + wc_pts + spec_pts + struct_pts, BLOCK_MAX)
    return round(total, 2), breakdown


# Block 2: Tool Mastery (max 3.0)

def _score_tool_mastery(
    metrics: BehavioralMetrics,
    user_features: dict,
    reasons: list[str],
) -> tuple[float, list[ScoreBreakdown]]:
    breakdown: list[ScoreBreakdown] = []
    advanced = getattr(metrics, "used_advanced_features_count", 0) or 0

    # Session advanced features (0–1.0)
    adv_pts = 0.0
    if advanced >= ADVANCED_HIGH:
        adv_pts = 1.0
        reasons.append(f"Active advanced features ({advanced} actions)")
    elif advanced >= ADVANCED_MEDIUM:
        adv_pts = 0.5
        reasons.append(f"Some advanced features ({advanced} actions)")
    breakdown.append(ScoreBreakdown(
        category="TM: Advanced Features",
        points=round(adv_pts, 2), max_points=1.0,
        detail=f"{advanced} session actions",
    ))

    # Specific tool flags (0–1.0)
    tool_pts = 0.0
    tool_parts: list[str] = []
    if metrics.used_system_prompt:
        tool_pts += 0.35
        tool_parts.append("system prompt")
    if metrics.used_variables:
        tool_pts += 0.35
        tool_parts.append("variables")
    if metrics.changed_model:
        tool_pts += 0.15
        tool_parts.append("model change")
    if metrics.changed_temperature:
        tool_pts += 0.15
        tool_parts.append("temperature change")
    tool_pts = min(tool_pts, 1.0)
    if tool_parts:
        reasons.append(f"Tools used: {', '.join(tool_parts)}")
    breakdown.append(ScoreBreakdown(
        category="TM: Tool Usage",
        points=round(tool_pts, 2), max_points=1.0,
        detail=", ".join(tool_parts) if tool_parts else "None",
    ))

    # Rolling advanced adoption from user profile (0–1.0)
    rolling_adv = user_features.get("advanced_actions_per_session", 0.0)
    diversity = user_features.get("advanced_mode_diversity", 0.0)
    specific_advanced_total = sum(float(user_features.get(key, 0) or 0) for key in (
        "system_prompt_edited_count",
        "variable_added_count",
        "few_shot_added_count",
        "compare_enabled_count",
        "self_consistency_enabled_count",
        "project_context_usage_count",
        "attachment_usage_count",
    ))
    rolling_pts = 0.0
    if rolling_adv >= 3.0 or diversity >= 4 or specific_advanced_total >= 8:
        rolling_pts = 1.0
    elif rolling_adv >= 1.0 or diversity >= 2 or specific_advanced_total >= 3:
        rolling_pts = 0.5
    elif rolling_adv >= 0.3 or specific_advanced_total >= 1:
        rolling_pts = 0.2
    breakdown.append(ScoreBreakdown(
        category="TM: Rolling Adoption",
        points=round(rolling_pts, 2), max_points=1.0,
        detail=f"{rolling_adv:.1f} advanced actions/session, diversity {diversity:.1f}",
    ))

    total = min(adv_pts + tool_pts + rolling_pts, BLOCK_MAX)
    return round(total, 2), breakdown


# Block 3: Autonomy (max 3.0)

def _score_autonomy(
    metrics: BehavioralMetrics,
    user_features: dict,
    reasons: list[str],
) -> tuple[float, list[ScoreBreakdown]]:
    breakdown: list[ScoreBreakdown] = []

    # Self-sufficiency: no tooltips after enough messages (0–1.0)
    suf_pts = 0.0
    if metrics.tooltip_click_count == 0 and metrics.session_message_count > SELF_SUFFICIENCY_MIN_MESSAGES:
        suf_pts = 1.0
        reasons.append("Self-sufficient (no help needed)")
    elif metrics.tooltip_click_count <= 1 and metrics.session_message_count > SELF_SUFFICIENCY_MIN_MESSAGES:
        suf_pts = 0.5
    breakdown.append(ScoreBreakdown(
        category="AU: Self-sufficiency",
        points=round(suf_pts, 2), max_points=1.0,
        detail=f"{metrics.tooltip_click_count} tooltip opens, {metrics.session_message_count} messages",
    ))

    # Low cancel rate (0–1.0)
    cancel_pts = 0.0
    cancel_rate = user_features.get("cancel_rate", 0.0)
    if cancel_rate == 0.0 and metrics.session_message_count >= 2:
        cancel_pts = 1.0
    elif cancel_rate < 0.1:
        cancel_pts = 0.7
    elif cancel_rate < HIGH_CANCEL_RATE_THRESHOLD:
        cancel_pts = 0.3
    breakdown.append(ScoreBreakdown(
        category="AU: Low Cancel Rate",
        points=round(cancel_pts, 2), max_points=1.0,
        detail=f"cancel rate: {cancel_rate:.2f}",
    ))

    # Low help ratio from user aggregates (0–1.0)
    help_pts = 0.0
    help_ratio = user_features.get("help_ratio", 0.0)
    tutor_completion_rate = user_features.get("tutor_completion_rate")
    if help_ratio == 0.0 and user_features.get("total_prompts", 0) >= 3:
        help_pts = 1.0
    elif help_ratio < 0.1 or (tutor_completion_rate is not None and tutor_completion_rate >= 0.8 and help_ratio < 0.3):
        help_pts = 0.7
    elif help_ratio < HIGH_HELP_RATIO_THRESHOLD or (tutor_completion_rate is not None and tutor_completion_rate >= 0.5):
        help_pts = 0.3
    breakdown.append(ScoreBreakdown(
        category="AU: Low Help Ratio",
        points=round(help_pts, 2), max_points=1.0,
        detail=f"help ratio: {help_ratio:.3f}, tutor completion: {tutor_completion_rate if tutor_completion_rate is not None else 'n/a'}",
    ))

    total = min(suf_pts + cancel_pts + help_pts, BLOCK_MAX)
    return round(total, 2), breakdown


# Block 4: Efficiency (max 3.0)

def _score_efficiency(
    metrics: BehavioralMetrics,
    reasons: list[str],
) -> tuple[float, list[ScoreBreakdown]]:
    breakdown: list[ScoreBreakdown] = []

    # Typing speed (0–1.0)
    effective_speed = min(metrics.chars_per_second, TYPING_SPEED_CAP)
    spd_pts = 0.0
    if effective_speed > TYPING_SPEED_THRESHOLD:
        spd_pts = 1.0
        reasons.append("Fast typing speed")
    elif effective_speed > TYPING_SPEED_THRESHOLD * 0.6:
        spd_pts = 0.5
    breakdown.append(ScoreBreakdown(
        category="EF: Typing Speed",
        points=round(spd_pts, 2), max_points=1.0,
        detail=f"{metrics.chars_per_second:.1f} chars/sec (cap {TYPING_SPEED_CAP:g})",
    ))

    # Session activity (0–1.0)
    act_pts = 0.0
    if metrics.session_message_count > SESSION_ACTIVITY_HIGH:
        act_pts = 1.0
        reasons.append(f"Experienced session ({metrics.session_message_count} messages)")
    elif metrics.session_message_count > SESSION_ACTIVITY_MEDIUM:
        act_pts = 0.5
    breakdown.append(ScoreBreakdown(
        category="EF: Session Activity",
        points=round(act_pts, 2), max_points=1.0,
        detail=f"{metrics.session_message_count} messages",
    ))

    # Consistent prompt length (0–1.0)
    avg_pts = 0.0
    if metrics.avg_prompt_length > AVG_PROMPT_LENGTH_THRESHOLD:
        avg_pts = 1.0
        reasons.append("Consistently long prompts")
    elif metrics.avg_prompt_length > AVG_PROMPT_LENGTH_THRESHOLD * 0.5:
        avg_pts = 0.5
    breakdown.append(ScoreBreakdown(
        category="EF: Avg Prompt Length",
        points=round(avg_pts, 2), max_points=1.0,
        detail=f"{metrics.avg_prompt_length:.0f} chars avg",
    ))

    total = min(spd_pts + act_pts + avg_pts, BLOCK_MAX)
    return round(total, 2), breakdown


# Block 5: Stability (max 3.0) — from rolling user aggregates

def _score_stability(
    user_features: dict,
    reasons: list[str],
) -> tuple[float, list[ScoreBreakdown]]:
    breakdown: list[ScoreBreakdown] = []
    sessions_count = user_features.get("sessions_count", 0)

    # Structured prompt consistency (0–1.0)
    struct_ratio = user_features.get("structured_prompt_ratio_rolling", 0.0)
    struct_pts = 0.0
    if struct_ratio >= 0.5:
        struct_pts = 1.0
        reasons.append(f"Consistently structured prompts ({struct_ratio:.0%})")
    elif struct_ratio >= 0.2:
        struct_pts = 0.5
    elif struct_ratio >= 0.05:
        struct_pts = 0.2
    breakdown.append(ScoreBreakdown(
        category="ST: Structured Prompts",
        points=round(struct_pts, 2), max_points=1.0,
        detail=f"{struct_ratio:.1%} structured (rolling)",
    ))

    # Refine accept rate — high means user acts on AI suggestions (0–1.0)
    accept_rate = user_features.get("refine_accept_rate")
    accept_pts = 0.0
    if accept_rate is not None:
        if accept_rate >= 0.7:
            accept_pts = 1.0
        elif accept_rate >= 0.4:
            accept_pts = 0.5
        elif accept_rate >= 0.1:
            accept_pts = 0.2
    breakdown.append(ScoreBreakdown(
        category="ST: Refine Accept Rate",
        points=round(accept_pts, 2), max_points=1.0,
        detail=f"{accept_rate:.1%} accept rate" if accept_rate is not None else "No refine data",
    ))

    # Session experience depth — more sessions = more stable signal (0–1.0)
    depth_pts = 0.0
    if sessions_count >= 8:
        depth_pts = 1.0
    elif sessions_count >= 4:
        depth_pts = 0.6
    elif sessions_count >= 2:
        depth_pts = 0.3
    breakdown.append(ScoreBreakdown(
        category="ST: Session Depth",
        points=round(depth_pts, 2), max_points=1.0,
        detail=f"{sessions_count} sessions tracked",
    ))

    positive_rate = user_features.get("message_feedback_positive_rate")
    negative_rate = user_features.get("message_feedback_negative_rate")
    feedback_pts = 0.0
    if positive_rate is not None:
        if positive_rate >= 0.75:
            feedback_pts = 0.5
        elif positive_rate >= 0.5:
            feedback_pts = 0.25
    if negative_rate is not None and negative_rate >= 0.5:
        feedback_pts -= 0.25
    breakdown.append(ScoreBreakdown(
        category="ST: Response Feedback",
        points=round(feedback_pts, 2), max_points=0.5,
        detail=f"positive: {positive_rate if positive_rate is not None else 'n/a'}, negative: {negative_rate if negative_rate is not None else 'n/a'}",
    ))

    total = min(struct_pts + accept_pts + depth_pts + feedback_pts, BLOCK_MAX)
    return round(total, 2), breakdown


# Penalties (reduce total score)

def _apply_penalties(
    user_features: dict,
    score: float,
    reasons: list[str],
) -> tuple[float, list[ScoreBreakdown]]:
    penalties: list[ScoreBreakdown] = []

    # High cancel rate penalty
    cancel_rate = user_features.get("cancel_rate", 0.0)
    if cancel_rate >= HIGH_CANCEL_RATE_THRESHOLD:
        score = max(0.0, score + HIGH_CANCEL_PENALTY)
        reasons.append(f"High cancel rate ({cancel_rate:.0%})")
        penalties.append(ScoreBreakdown(
            category="Penalty: High Cancel Rate",
            points=HIGH_CANCEL_PENALTY, max_points=0.0,
            detail=f"cancel rate {cancel_rate:.1%} >= {HIGH_CANCEL_RATE_THRESHOLD:.0%}",
        ))

    # High help ratio penalty
    help_ratio = user_features.get("help_ratio", 0.0)
    if help_ratio >= HIGH_HELP_RATIO_THRESHOLD:
        score = max(0.0, score + HIGH_HELP_PENALTY)
        reasons.append(f"High help dependency ({help_ratio:.1%})")
        penalties.append(ScoreBreakdown(
            category="Penalty: High Help Ratio",
            points=HIGH_HELP_PENALTY, max_points=0.0,
            detail=f"help ratio {help_ratio:.1%} >= {HIGH_HELP_RATIO_THRESHOLD:.0%}",
        ))

    return score, penalties


# Main entry point

def compute_score(
    request: AnalyzeRequest,
    user_features: dict | None = None,
):
    """
    Compute user level score using Rule Engine V2.

    Args:
        request: The analyze request with prompt text and session metrics.
        user_features: Rolling user-level aggregates from profile_features_json.
                       If None, Stability/Autonomy blocks get minimal scores.

    Returns:
        Tuple of (level, confidence, reasons, score, normalized, breakdown, ml_info).
    """
    text = request.prompt_text.strip()
    metrics = request.metrics or BehavioralMetrics()
    uf = user_features or {}
    reasons: list[str] = []
    all_breakdown: list[ScoreBreakdown] = []

    # Score each block
    pc_score, pc_bd = _score_prompt_craftsmanship(text, reasons)
    tm_score, tm_bd = _score_tool_mastery(metrics, uf, reasons)
    au_score, au_bd = _score_autonomy(metrics, uf, reasons)
    ef_score, ef_bd = _score_efficiency(metrics, reasons)
    st_score, st_bd = _score_stability(uf, reasons)

    # Block summary entries
    all_breakdown.append(ScoreBreakdown(
        category="Prompt Craftsmanship", points=pc_score, max_points=BLOCK_MAX,
        detail=f"Block total",
    ))
    all_breakdown.extend(pc_bd)
    all_breakdown.append(ScoreBreakdown(
        category="Tool Mastery", points=tm_score, max_points=BLOCK_MAX,
        detail=f"Block total",
    ))
    all_breakdown.extend(tm_bd)
    all_breakdown.append(ScoreBreakdown(
        category="Autonomy", points=au_score, max_points=BLOCK_MAX,
        detail=f"Block total",
    ))
    all_breakdown.extend(au_bd)
    all_breakdown.append(ScoreBreakdown(
        category="Efficiency", points=ef_score, max_points=BLOCK_MAX,
        detail=f"Block total",
    ))
    all_breakdown.extend(ef_bd)
    all_breakdown.append(ScoreBreakdown(
        category="Stability", points=st_score, max_points=BLOCK_MAX,
        detail=f"Block total",
    ))
    all_breakdown.extend(st_bd)

    raw_score = pc_score + tm_score + au_score + ef_score + st_score

    # Apply penalties (behavioral only — no content-based penalties)
    score, penalty_bd = _apply_penalties(uf, raw_score, reasons)
    all_breakdown.extend(penalty_bd)

    # Normalize and determine level
    normalized = min(score / MAX_SCORE, 1.0)

    # Confidence: combines data richness with score certainty
    data_depth = min(uf.get("sessions_count", 0) / 5, 1.0)
    score_certainty = 1 - math.exp(-score / 3)
    confidence = round(0.4 * data_depth + 0.6 * score_certainty, 2)

    if normalized >= L3_THRESHOLD:
        level = 3
    elif normalized >= L2_THRESHOLD:
        level = 2
    else:
        level = 1

    # ML blending
    metrics_dict = {
        "chars_per_second": metrics.chars_per_second,
        "session_message_count": metrics.session_message_count,
        "avg_prompt_length": metrics.avg_prompt_length,
        "used_advanced_features_count": getattr(metrics, "used_advanced_features_count", 0),
        "tooltip_click_count": getattr(metrics, "tooltip_click_count", 0),
    }
    ml_level, ml_conf = ml_classifier.ml_predict(
        text,
        metrics_dict,
        has_structure_fn=has_structured_patterns,
    )

    ml_info: dict = {
        "ml_level": ml_level,
        "ml_confidence": round(ml_conf, 4),
        "ml_score": None,
        "ml_blended": False,
    }

    if ml_conf > ML_BLEND_MIN_CONFIDENCE:
        ml_normalized = (ml_level - 1) / 2.0
        # Symmetric blending: weight each source by its relative confidence.
        # ML influence is capped at 50% so rule engine always has majority vote.
        total_conf = confidence + ml_conf
        if total_conf > 0:
            ml_weight = min(0.5, (ml_conf / total_conf) * ML_BLEND_BASE_WEIGHT * 2)
        else:
            ml_weight = ML_BLEND_BASE_WEIGHT
        blended = normalized * (1 - ml_weight) + ml_normalized * ml_weight
        if abs(blended - normalized) > ML_BLEND_REASON_DELTA:
            reasons.append(f"ML adjustment: L{ml_level} ({ml_conf:.0%} confidence)")
        ml_info["ml_score"] = round(blended * MAX_SCORE, 4)
        ml_info["ml_blended"] = True
        normalized = blended
        score = round(blended * MAX_SCORE, 2)
        # Recalculate confidence after blending
        score_certainty = 1 - math.exp(-score / 3)
        confidence = round(0.4 * data_depth + 0.6 * score_certainty, 2)
        if normalized >= L3_THRESHOLD:
            level = 3
        elif normalized >= L2_THRESHOLD:
            level = 2
        else:
            level = 1

    if not reasons:
        reasons.append("Simple short prompt — Guided mode recommended")

    return (
        level,
        confidence,
        reasons,
        round(score, 2),
        round(normalized, 4),
        all_breakdown,
        ml_info,
    )
