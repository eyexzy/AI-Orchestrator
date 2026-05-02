"""
ML classifier for user experience level detection.
Uses scikit-learn models (LogisticRegression, RandomForest, SVC) with
TF-IDF text features combined with behavioral features.
"""
import base64
import json
import logging
import pickle
from collections.abc import Mapping
from typing import Literal

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from scipy.sparse import hstack, issparse, csr_matrix

logger = logging.getLogger("ml-classifier")

ModelType = Literal["LogisticRegression", "RandomForest", "SVC"]

# Behavioral feature names (text features are handled by TF-IDF separately)
BEHAVIORAL_FEATURE_NAMES = [
    "prompt_length",
    "word_count",
    "has_structure",
    "chars_per_second",
    "session_message_count",
    "avg_prompt_length",
    "used_advanced_features_count",
    "tooltip_click_count",
]

# Kept for backwards-compat with admin.py imports
FEATURE_NAMES = BEHAVIORAL_FEATURE_NAMES


def _is_invalid_proba_vector(proba: np.ndarray) -> bool:
    """Validate probability vector before argmax-based class selection."""
    if proba is None:
        return True

    arr = np.asarray(proba, dtype=float).ravel()
    if arr.size == 0:
        return True
    if np.isnan(arr).any() or np.isinf(arr).any():
        return True
    if np.allclose(arr, 0.0):
        return True
    return False


def _make_sklearn_model(
    model_type: ModelType = "LogisticRegression",
    model_params: Mapping[str, object] | None = None,
):
    """Create a fresh sklearn estimator by name."""
    params = dict(model_params or {})
    if model_type == "RandomForest":
        default_params = {
            "n_estimators": 100,
            "max_depth": 10,
            "class_weight": "balanced",
            "random_state": 42,
        }
        return RandomForestClassifier(**{**default_params, **params})
    if model_type == "SVC":
        default_params = {
            "kernel": "rbf",
            "probability": True,
            "class_weight": "balanced",
            "random_state": 42,
        }
        return SVC(**{**default_params, **params})
    # Default: LogisticRegression
    default_params = {
        "max_iter": 1000,
        "class_weight": "balanced",
        "random_state": 42,
    }
    return LogisticRegression(**{**default_params, **params})


def extract_behavioral_features(prompt_text: str, metrics: dict, has_structure_fn=None) -> np.ndarray:
    """Extract behavioral (non-text) feature vector."""
    text = prompt_text.strip()

    if has_structure_fn is None:
        try:
            from services.scoring import has_structured_patterns
            has_structure_fn = has_structured_patterns
        except ImportError:
            import re

            def has_structure_fn(t: str) -> bool:
                patterns = [
                    r"\{\{.*?\}\}", r"```", r"system\s*(?:message|prompt|:)",
                    r"step\s*\d", r"\bif\b.*\bthen\b", r"(?:^|\n)\s*[-*]\s+", r"\brole\s*:",
                ]
                return any(re.search(p, t, re.IGNORECASE) for p in patterns)

    return np.array([
        len(text), # prompt_length
        len(text.split()), # word_count
        1.0 if has_structure_fn(text) else 0.0, # has_structure
        float(metrics.get("chars_per_second", 0)),
        float(metrics.get("session_message_count", 0)),
        float(metrics.get("avg_prompt_length", 0)),
        float(metrics.get("used_advanced_features_count", 0)),
        float(metrics.get("tooltip_click_count", 0)),
    ], dtype=float)


# Legacy alias used by admin.py feedback endpoint
def extract_features(prompt_text: str, metrics: dict, get_score_fn=None, has_structure_fn=None) -> np.ndarray:
    """Legacy wrapper — returns behavioral features only (no TF-IDF).
    Inserts semantic_tech_score at index 2 for DB-row backward compat."""
    beh = extract_behavioral_features(prompt_text, metrics, has_structure_fn)
    if get_score_fn is None:
        try:
            from services.scoring import get_semantic_score
            get_score_fn = get_semantic_score
        except ImportError:
            get_score_fn = lambda t: 0.0
    semantic_score = get_score_fn(prompt_text)
    return np.insert(beh, 2, semantic_score)


class SklearnClassifier:
    """Wrapper around sklearn estimator + TfidfVectorizer for serialization to DB."""

    def __init__(
        self,
        model_type: ModelType = "LogisticRegression",
        model_params: Mapping[str, object] | None = None,
    ):
        self.model_type = model_type
        self.model_params = dict(model_params or {})
        self.tfidf = TfidfVectorizer(max_features=200, ngram_range=(1, 2), sublinear_tf=True)
        self.scaler = StandardScaler()
        self.model = _make_sklearn_model(model_type, self.model_params)
        self.is_trained = False
        self.classes = [1, 2, 3]

    def _build_features(self, texts: list[str], behavioral_X: np.ndarray, fit: bool = False):
        """Combine TF-IDF text features with behavioral features."""
        if fit:
            tfidf_matrix = self.tfidf.fit_transform(texts)
            behavioral_scaled = self.scaler.fit_transform(behavioral_X)
        else:
            tfidf_matrix = self.tfidf.transform(texts)
            behavioral_scaled = self.scaler.transform(behavioral_X)

        behavioral_sparse = csr_matrix(behavioral_scaled)
        return hstack([tfidf_matrix, behavioral_sparse])

    def fit(
        self,
        texts: list[str],
        behavioral_X: np.ndarray,
        y: np.ndarray,
        sample_weight: np.ndarray | None = None,
    ):
        """Train on text + behavioral features with optional sample weights."""
        X_combined = self._build_features(texts, behavioral_X, fit=True)
        self.model.fit(X_combined, y, sample_weight=sample_weight)
        self.is_trained = True

    def predict_proba(self, texts: list[str], behavioral_X: np.ndarray) -> np.ndarray:
        """Return probability matrix (n_samples, 3)."""
        X_combined = self._build_features(texts, behavioral_X, fit=False)
        return self.model.predict_proba(X_combined)

    def predict(self, text: str, behavioral_features: np.ndarray) -> int:
        """Predict single sample — returns class label (1, 2, or 3)."""
        proba_matrix = self.predict_proba([text], behavioral_features.reshape(1, -1))
        if proba_matrix is None or proba_matrix.size == 0:
            return 1

        proba = np.asarray(proba_matrix[0], dtype=float)
        if _is_invalid_proba_vector(proba):
            return 1

        pred_idx = int(np.argmax(proba))
        if pred_idx < 0 or pred_idx >= len(self.classes):
            return 1
        return int(self.classes[pred_idx])

    def to_dict(self) -> dict:
        """Serialize entire classifier (model + tfidf + scaler) to base64 string in a dict."""
        blob = pickle.dumps({
            "model": self.model,
            "tfidf": self.tfidf,
            "scaler": self.scaler,
            "model_type": self.model_type,
        })
        return {
            "pickle_b64": base64.b64encode(blob).decode("ascii"),
            "model_type": self.model_type,
            "model_params": self.model_params,
        }

    def from_dict(self, data: dict):
        """Restore from serialized dict."""
        blob = base64.b64decode(data["pickle_b64"])
        state = pickle.loads(blob)  # noqa: S301 — trusted data from our own DB
        self.model = state["model"]
        self.tfidf = state["tfidf"]
        self.scaler = state["scaler"]
        self.model_type = state.get("model_type", "LogisticRegression")
        self.model_params = dict(state.get("model_params", {}))
        self.is_trained = True


# Synthetic training data (used when no real feedback exists)

def _create_synthetic_training_data():
    """Generate diverse synthetic data for cold-start.

    Behavioral features order:
      [prompt_length, word_count, has_structure, chars_per_second,
       session_message_count, avg_prompt_length, used_advanced_features_count,
       tooltip_click_count]

    Coverage: 20 L1 + 20 L2 + 20 L3 = 60 samples across diverse topics
    (AI/tech, cooking, writing, legal, creative, business, education, science)
    and both Ukrainian and English.
    """
    samples = [
        # ── L1: short, vague, no constraints, slow typing, few messages, clicks tooltips ──

        # Tech topics
        ("напиши про штучний інтелект",
         [30, 5, 0, 1.5, 1, 30, 0, 3], 1),
        ("що таке машинне навчання",
         [28, 5, 0, 1.8, 2, 28, 0, 2], 1),
        ("розкажи про python",
         [20, 3, 0, 1.2, 1, 20, 0, 2], 1),
        ("як зробити сайт",
         [18, 3, 0, 1.0, 1, 18, 0, 3], 1),
        ("what is chatgpt",
         [15, 3, 0, 2.0, 2, 15, 0, 1], 1),

        # Everyday topics
        ("напиши рецепт борщу",
         [22, 4, 0, 1.6, 1, 22, 0, 2], 1),
        ("як схуднути",
         [14, 2, 0, 1.3, 1, 14, 0, 3], 1),
        ("розкажи про україну",
         [22, 3, 0, 1.5, 2, 20, 0, 2], 1),
        ("напиши вірш",
         [12, 2, 0, 1.1, 1, 12, 0, 2], 1),
        ("write a story",
         [14, 3, 0, 1.8, 1, 14, 0, 1], 1),

        # Edge cases: slightly longer but still vague/unstructured
        ("можеш пояснити що таке база даних простими словами",
         [52, 9, 0, 2.2, 2, 45, 0, 2], 1),
        ("напиши щось цікаве про космос для мене",
         [40, 7, 0, 1.9, 1, 38, 0, 3], 1),
        ("tell me about machine learning please",
         [37, 6, 0, 2.5, 2, 37, 0, 1], 1),
        ("як навчитися програмувати",
         [28, 4, 0, 1.7, 3, 25, 0, 2], 1),
        ("поясни що таке нейронна мережа",
         [33, 6, 0, 2.0, 2, 33, 0, 2], 1),

        # Minimal output — single-word or two-word queries
        ("переклади текст",
         [16, 2, 0, 1.4, 1, 16, 0, 3], 1),
        ("summarize this",
         [13, 2, 0, 1.5, 1, 13, 0, 1], 1),
        ("напиши email",
         [13, 2, 0, 1.2, 2, 13, 0, 2], 1),
        ("explain sql",
         [10, 2, 0, 1.6, 1, 10, 0, 1], 1),
        ("що таке api",
         [12, 3, 0, 1.3, 1, 12, 0, 3], 1),

        # ── L2: medium length, some specificity, moderate speed, occasional advanced use ──

        # Tech / AI
        ("Поясни як працює fine-tuning моделей GPT і які є підходи до transfer learning",
         [80, 15, 0, 4.0, 5, 85, 1, 0], 2),
        ("Порівняй RAG та fine-tuning для побудови чат-бота. Наведи переваги кожного підходу",
         [95, 17, 0, 4.5, 4, 90, 2, 0], 2),
        ("Як налаштувати temperature та top-p для різних задач генерації тексту?",
         [78, 13, 0, 5.0, 5, 80, 2, 1], 2),
        ("Write a Python function that reads a CSV file and calculates average values per column",
         [90, 16, 1, 5.5, 6, 88, 1, 0], 2),
        ("Explain the difference between SQL JOIN types with examples for each",
         [68, 12, 0, 4.8, 4, 72, 1, 0], 2),

        # Business / writing
        ("Напиши email колезі з проханням перенести зустріч на завтра на 14:00, тон — ділова",
         [95, 17, 0, 4.2, 5, 92, 1, 0], 2),
        ("Склади план маркетингової кампанії для запуску мобільного застосунку. Аудиторія — молодь 18-25",
         [105, 18, 0, 5.2, 6, 100, 2, 0], 2),
        ("Write a professional LinkedIn post about launching a new product. Keep it under 200 words",
         [92, 16, 0, 5.8, 5, 95, 1, 0], 2),
        ("Допоможи написати резюме для позиції junior developer. Є 1 рік досвіду у Python та SQL",
         [100, 18, 0, 4.6, 7, 98, 2, 1], 2),
        ("Explain agile methodology and how sprints work. Give a concrete 2-week sprint example",
         [88, 15, 0, 5.1, 5, 85, 1, 0], 2),

        # Education / science
        ("Поясни принцип роботи фотосинтезу простою мовою для учнів 8 класу",
         [75, 13, 0, 4.3, 4, 78, 1, 0], 2),
        ("Summarize the key causes of World War I in bullet points for a high school student",
         [85, 15, 0, 5.0, 5, 82, 1, 0], 2),
        ("Напиши задачу з математики на тему відсотків для 6-го класу з рішенням",
         [80, 14, 0, 4.7, 4, 82, 1, 0], 2),
        ("Explain how vaccines work and why herd immunity matters. Keep it factual, no jargon",
         [82, 15, 0, 5.3, 6, 80, 2, 0], 2),
        ("Як написати наукову статтю? Поясни структуру: вступ, методи, результати, обговорення",
         [90, 15, 0, 4.9, 5, 88, 1, 0], 2),

        # Creative / everyday
        ("Напиши короткий сценарій для YouTube відео про подорожі. Тривалість — 3 хвилини",
         [88, 15, 0, 4.4, 5, 85, 2, 0], 2),
        ("Generate 5 unique names for a coffee shop with a cozy, Scandinavian aesthetic",
         [78, 14, 0, 5.6, 4, 80, 1, 0], 2),
        ("Напиши привітання на день народження другу. Стиль — гумористичний, неформальний",
         [85, 14, 0, 4.1, 3, 82, 1, 1], 2),
        ("Compose a short poem about autumn in the city. Use vivid imagery, 8–12 lines",
         [72, 14, 0, 5.2, 4, 75, 1, 0], 2),
        ("Translate this business email to formal Ukrainian and adjust tone for C-level audience",
         [88, 15, 0, 5.4, 5, 85, 2, 0], 2),

        # ── L3: long, structured, role assignment, multi-step, high typing speed, no tooltips ──

        # AI / ML engineering
        ("Act as a senior ML engineer. Compare transformer attention mechanisms: "
         "self-attention vs cross-attention vs multi-head attention. "
         "Provide code examples in PyTorch. Analyze computational complexity O(n²d). "
         "Format: markdown with code blocks.",
         [310, 55, 1, 9.0, 14, 290, 5, 0], 3),
        ("Ти — експерт з NLP. Розроби pipeline для класифікації тексту: "
         "1) TF-IDF vectorization 2) Feature engineering 3) Model selection (LogReg/SVM/RF) "
         "4) Hyperparameter tuning з GridSearchCV 5) Evaluation: confusion matrix + ROC-AUC. "
         "Поверни повний код Python.",
         [380, 65, 1, 10.5, 16, 360, 6, 0], 3),
        ("Design a production RAG system: ChromaDB vector store, OpenAI text-embedding-3-small, "
         "LangChain retrieval chain, chain-of-thought prompting, few-shot examples. "
         "Include: error handling, async streaming, token budget management. "
         "Output: architecture diagram + annotated code.",
         [290, 52, 1, 8.5, 12, 280, 5, 0], 3),
        ("Implement ablation study for Random Forest: compute SHAP feature importance, "
         "plot learning curves, compare precision/recall/F1 across 5-fold CV. "
         "Use sklearn Pipeline with StandardScaler + ColumnTransformer. "
         "Return: reproducible code + interpretation of results.",
         [320, 58, 1, 9.2, 13, 310, 5, 0], 3),
        ("You are a data engineer. Build an ETL pipeline: "
         "1) ingest CSV from S3 2) validate schema with Pydantic 3) transform with pandas "
         "4) load to PostgreSQL with upsert 5) schedule with Airflow DAG. "
         "Handle NULL values, duplicates, encoding errors. Include unit tests.",
         [350, 63, 1, 8.8, 15, 335, 6, 0], 3),

        # Backend / system design
        ("Реалізуй REST API на FastAPI: async endpoints, SQLAlchemy async ORM, Alembic migrations, "
         "Redis cache для GET запитів, rate limiting з slowapi, JWT auth, "
         "structured JSON logging, Docker + docker-compose, GitHub Actions CI/CD. "
         "Поверни: структуру проєкту + ключові файли з коментарями.",
         [420, 72, 1, 11.0, 18, 410, 7, 0], 3),
        ("Design a microservices architecture for an e-commerce platform: "
         "user service, product catalog, order processing, payment gateway, notification service. "
         "Include: API Gateway, event bus (Kafka), distributed tracing (Jaeger), "
         "circuit breaker pattern, eventual consistency strategy.",
         [330, 58, 1, 8.2, 13, 320, 5, 0], 3),
        ("You are a senior backend engineer. Optimize this PostgreSQL query for a 50M-row table: "
         "avoid N+1, use proper indexes, consider partitioning by date, "
         "add EXPLAIN ANALYZE output interpretation. "
         "Target: < 100ms response time at p99.",
         [280, 50, 1, 8.6, 11, 275, 4, 0], 3),

        # Research / academic writing
        ("Ти — науковий редактор. Перевір цей розділ дисертації: "
         "1) логічність аргументації 2) відповідність APA 7 стилю цитування "
         "3) академічний тон без пасивних конструкцій 4) перехід між абзацами. "
         "Поверни: виправлений текст + коментарі по кожному пункту.",
         [295, 52, 1, 9.5, 12, 285, 5, 0], 3),
        ("Act as a research assistant. Conduct a structured literature review on "
         "adaptive user interfaces: "
         "1) define scope (2015–2024, HCI + ML papers) "
         "2) identify key themes "
         "3) compare approaches: rule-based vs ML-driven "
         "4) identify research gaps "
         "5) suggest citation sources. Format as academic report.",
         [360, 65, 1, 8.0, 14, 350, 5, 0], 3),

        # Business strategy / legal
        ("You are a business strategist. Conduct a SWOT analysis for a B2B SaaS startup "
         "entering the Eastern European market. Include: competitive landscape, "
         "regulatory risks (GDPR compliance), go-to-market strategy for SME segment, "
         "pricing model comparison (freemium vs seat-based), 12-month OKR framework.",
         [330, 57, 1, 7.8, 13, 320, 5, 0], 3),
        ("Ти — юридичний консультант. Проаналізуй цей договір про надання послуг: "
         "1) виявити ризикові клаузи для виконавця 2) перевірити відповідність ЦКУ "
         "3) запропонувати альтернативні формулювання для п.4.2 і п.7.1 "
         "4) оцінити механізм вирішення спорів. Формат: структурований звіт.",
         [310, 55, 1, 9.8, 12, 300, 6, 0], 3),

        # Creative writing with constraints
        ("You are a professional screenwriter. Write act 1 of a short film script (5 pages): "
         "genre: psychological thriller, setting: Kyiv 2025, protagonist: female data scientist. "
         "Follow 3-act structure, include inciting incident on page 3, "
         "use proper screenplay format (INT./EXT., action lines, dialogue). "
         "Tone: tense, cerebral.",
         [360, 65, 1, 8.4, 15, 348, 5, 0], 3),
        ("Напиши маркетинговий текст для лендінгу SaaS-продукту: "
         "цільова аудиторія — CTOs компаній 50-200 осіб, "
         "ключові болі: інтеграція, безпека даних, масштабованість. "
         "Структура: заголовок (до 10 слів), підзаголовок, 3 блоки переваг, CTA. "
         "Тон: впевнений, технічно обгрунтований, без кліше.",
         [340, 60, 1, 9.1, 13, 330, 5, 0], 3),

        # Education design
        ("Act as an instructional designer. Create a 4-week online course curriculum on "
         "prompt engineering for non-technical professionals: "
         "week 1: fundamentals, week 2: domain-specific templates, "
         "week 3: iterative refinement techniques, week 4: capstone project. "
         "Include: learning objectives (Bloom's taxonomy), assessment rubrics, "
         "estimated time per module.",
         [370, 65, 1, 8.7, 14, 360, 5, 0], 3),

        # Data analysis
        ("Ти — аналітик даних. Проведи аналіз датасету поведінки користувачів: "
         "1) descriptive statistics для всіх числових колонок "
         "2) кореляційна матриця з heatmap (seaborn) "
         "3) сегментація користувачів через k-means (k=3) "
         "4) інтерпретація кластерів через feature importance "
         "5) рекомендації для продуктової команди. "
         "Поверни: повний Python код + висновки.",
         [390, 70, 1, 10.2, 17, 380, 7, 0], 3),

        # System prompting / AI workflow
        ("Design a multi-agent AI workflow for automated code review: "
         "agent 1: static analysis (AST parsing, complexity metrics), "
         "agent 2: security scanner (OWASP top 10), "
         "agent 3: style checker (PEP8/ESLint), "
         "agent 4: test coverage analyzer, "
         "orchestrator: aggregates reports, prioritizes issues, generates PR comment. "
         "Specify: tools, inter-agent communication protocol, output schema.",
         [400, 70, 1, 9.5, 16, 390, 7, 0], 3),

        # Short but highly structured L3 (edge case — brevity ≠ novice)
        ("You are a DevOps expert. Output: Kubernetes HPA config for a FastAPI service. "
         "Constraints: min 2 replicas, max 10, CPU threshold 70%, memory 80%. "
         "Use apiVersion apps/v1. Include readinessProbe.",
         [220, 40, 1, 10.0, 11, 215, 5, 0], 3),
        ("Ти — архітектор БД. Спроєктуй схему для SaaS з multi-tenancy: "
         "row-level security через user_email, індекси для OLAP запитів, "
         "партиціонування по created_at, soft delete через deleted_at. "
         "Поверни: SQL DDL + обґрунтування кожного рішення.",
         [250, 45, 1, 9.8, 12, 245, 6, 0], 3),
    ]

    texts = [s[0] for s in samples]
    behavioral_X = np.array([s[1] for s in samples], dtype=float)
    y = np.array([s[2] for s in samples])
    return texts, behavioral_X, y


# Global classifier instance

_classifier = SklearnClassifier()

# ID of the model row currently loaded in this process.
# Used by the background sync loop to detect when a newer model is in the DB.
_loaded_model_id: int | None = None


def get_classifier() -> SklearnClassifier:
    return _classifier


def _train_fresh():
    """Train on synthetic data for cold-start."""
    global _classifier
    texts, behavioral_X, y = _create_synthetic_training_data()
    _classifier.fit(texts, behavioral_X, y)
    logger.info("[ml] Model trained on synthetic data (sklearn)")


def ml_predict(prompt_text: str, metrics: dict, *, has_structure_fn=None) -> tuple[int, float]:
    """Returns (predicted_level, confidence)."""
    try:
        clf = get_classifier()
        if not clf.is_trained:
            return 1, 0.0
        behavioral = extract_behavioral_features(prompt_text, metrics, has_structure_fn)
        proba = clf.predict_proba([prompt_text], behavioral.reshape(1, -1))[0]
        if _is_invalid_proba_vector(proba):
            return 1, 0.0
        predicted_class = int(proba.argmax()) + 1
        confidence = float(proba.max())
        return predicted_class, confidence
    except Exception as e:
        logger.error(f"[ml] Prediction failed: {e}")
        return 1, 0.0


def ml_predict_batch(
    prompt_texts: list[str],
    metrics_list: list[dict],
    has_structure_fn=None,
) -> list[tuple[int, float]]:
    """Batch prediction helper for analytics endpoints."""
    if not prompt_texts:
        return []

    if len(prompt_texts) != len(metrics_list):
        logger.error(
            "[ml] Batch prediction input mismatch: prompt_texts=%s metrics_list=%s",
            len(prompt_texts),
            len(metrics_list),
        )
        size = min(len(prompt_texts), len(metrics_list))
        prompt_texts = prompt_texts[:size]
        metrics_list = metrics_list[:size]

    try:
        clf = get_classifier()
        if not clf.is_trained:
            return [(1, 0.0) for _ in prompt_texts]

        behavioral_rows = [
            extract_behavioral_features(
                prompt_texts[i],
                metrics_list[i] if isinstance(metrics_list[i], dict) else {},
                has_structure_fn,
            )
            for i in range(len(prompt_texts))
        ]
        behavioral_X = np.vstack(behavioral_rows)
        proba_matrix = clf.predict_proba(prompt_texts, behavioral_X)

        results: list[tuple[int, float]] = []
        for row in np.asarray(proba_matrix):
            if _is_invalid_proba_vector(row):
                results.append((1, 0.0))
                continue
            level = int(np.argmax(row)) + 1
            conf = float(np.max(row))
            results.append((level, conf))
        return results
    except Exception as e:
        logger.error(f"[ml] Batch prediction failed: {e}")
        return [(1, 0.0) for _ in prompt_texts]


async def load_latest_model_from_db(db) -> dict | None:
    """Load latest model version from DB into global classifier."""
    global _loaded_model_id
    from sqlalchemy import select
    from database import MLModelCache

    result = await db.execute(
        select(MLModelCache)
        .order_by(MLModelCache.updated_at.desc(), MLModelCache.id.desc())
        .limit(1)
    )
    cache_row = result.scalars().first()
    if not cache_row or not cache_row.weights_json:
        return None

    payload = json.loads(cache_row.weights_json)
    get_classifier().from_dict(payload)
    _loaded_model_id = cache_row.id
    return {
        "id": cache_row.id,
        "model_type": cache_row.model_type,
        "accuracy": cache_row.accuracy,
        "f1_score": cache_row.f1_score,
        "samples_used": cache_row.samples_used,
        "updated_at": cache_row.updated_at.isoformat() if cache_row.updated_at else None,
    }


async def check_and_reload_if_newer(db) -> bool:
    """Check if DB has a newer model than what this process has loaded.

    Called by the background sync loop every N seconds so that all worker
    processes pick up a model retrained in another process automatically.
    Returns True if the model was reloaded.
    """
    global _loaded_model_id
    from sqlalchemy import select
    from database import MLModelCache

    row = await db.execute(
        select(MLModelCache.id)
        .order_by(MLModelCache.updated_at.desc(), MLModelCache.id.desc())
        .limit(1)
    )
    latest_id: int | None = row.scalar()
    if latest_id is None:
        return False
    if _loaded_model_id is not None and latest_id == _loaded_model_id:
        return False  # already up to date

    meta = await load_latest_model_from_db(db)
    return meta is not None