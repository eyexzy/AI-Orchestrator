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

    def fit(self, texts: list[str], behavioral_X: np.ndarray, y: np.ndarray):
        """Train on text + behavioral features."""
        X_combined = self._build_features(texts, behavioral_X, fit=True)
        self.model.fit(X_combined, y)
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
    """Generate synthetic data for cold-start.
    Returns (texts, behavioral_X, y).
    """
    samples = [
        # L1: short, vague, no structure
        ("напиши про штучний інтелект", [20, 4, 0, 1.5, 1, 20, 0, 2], 1),
        ("що таке машинне навчання", [35, 6, 0, 2.0, 2, 30, 0, 1], 1),
        ("розкажи про нейронні мережі", [15, 3, 0, 1.0, 1, 15, 0, 3], 1),
        ("як працює chatgpt", [45, 8, 0, 2.5, 3, 35, 0, 0], 1),
        ("що можна зробити з ai", [30, 5, 0, 1.8, 2, 28, 0, 2], 1),
        # L2: medium, some technical terms, some structure
        ("Поясни як працює fine-tuning моделей GPT. Які є підходи до transfer learning?",
         [120, 22, 0, 4.0, 5, 110, 1, 0], 2),
        ("Порівняй RAG та fine-tuning для побудови чат-бота з власними даними у форматі таблиці",
         [95, 18, 0, 5.0, 4, 100, 2, 0], 2),
        ("Напиши приклад використання LangChain з vector store для пошуку по документах",
         [150, 28, 1, 4.5, 6, 130, 1, 1], 2),
        ("Як налаштувати temperature та top-p параметри для різних задач генерації тексту?",
         [85, 16, 0, 5.5, 5, 90, 3, 0], 2),
        ("Поясни різницю між embedding моделями та генеративними LLM. Наведи приклади використання",
         [110, 20, 1, 4.2, 7, 105, 2, 0], 2),
        # L3: long, structured, heavy technical vocabulary
        ("Act as a senior ML engineer. Compare transformer attention mechanisms: "
         "self-attention vs cross-attention vs multi-head attention. "
         "Provide code examples in PyTorch and analyze computational complexity O(n²d).",
         [280, 55, 1, 8.0, 12, 250, 4, 0], 3),
        ("Ти — експерт з NLP. Розроби pipeline для класифікації тексту: "
         "1) TF-IDF vectorization 2) Feature engineering 3) Model selection (LogReg vs SVM vs RF) "
         "4) Hyperparameter tuning з GridSearchCV 5) Evaluation з confusion matrix та ROC-AUC.",
         [350, 70, 1, 9.5, 15, 300, 5, 0], 3),
        ("Design a RAG system architecture using ChromaDB as vector store, "
         "OpenAI embeddings for retrieval, and implement chain-of-thought prompting "
         "with few-shot examples. Include error handling and streaming.",
         [220, 45, 1, 7.5, 10, 220, 3, 0], 3),
        ("Реалізуй REST API на FastAPI з WebSocket streaming для LLM inference. "
         "Використай async/await, connection pooling для PostgreSQL, "
         "Redis кеш для embeddings, та Docker compose для деплою. "
         "Покажи Dockerfile та CI/CD pipeline.",
         [400, 80, 1, 10.0, 18, 380, 6, 0], 3),
        ("Implement ablation study: train Random Forest classifier, "
         "compute SHAP values for feature importance, plot learning curves, "
         "and compare precision/recall/F1 across 5-fold cross-validation. "
         "Use scikit-learn Pipeline with StandardScaler.",
         [310, 62, 1, 8.8, 14, 290, 4, 0], 3),
    ]

    texts = [s[0] for s in samples]
    behavioral_X = np.array([s[1] for s in samples], dtype=float)
    y = np.array([s[2] for s in samples])
    return texts, behavioral_X, y


# Global classifier instance

_classifier = SklearnClassifier()


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
    return {
        "id": cache_row.id,
        "model_type": cache_row.model_type,
        "accuracy": cache_row.accuracy,
        "f1_score": cache_row.f1_score,
        "samples_used": cache_row.samples_used,
        "updated_at": cache_row.updated_at.isoformat() if cache_row.updated_at else None,
    }