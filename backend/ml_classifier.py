"""
Simple ML classifier for user experience level detection.
Uses LogisticRegression trained on synthetic + accumulated data.
Complements the rule-based scoring system.
"""
import numpy as np
import json
import os
import logging
from pathlib import Path

logger = logging.getLogger("ml-classifier")

# Feature names (must match extract_features output)
FEATURE_NAMES = [
    "prompt_length",
    "word_count", 
    "tech_term_count",
    "has_structure",
    "chars_per_second",
    "session_message_count",
    "avg_prompt_length",
    "used_advanced_features_count",
    "tooltip_click_count",
]

MODEL_PATH = Path(__file__).parent / "ml_model.json"


def extract_features(prompt_text: str, metrics: dict, count_tech_fn=None, has_structure_fn=None) -> np.ndarray:
    """Extract feature vector from prompt and behavioral metrics."""
    text = prompt_text.strip()
    
    # Import here to avoid circular imports, or use passed functions
    if count_tech_fn is None or has_structure_fn is None:
        try:
            from main import _count_technical_terms, _has_structured_patterns
            count_tech_fn = _count_technical_terms
            has_structure_fn = _has_structured_patterns
        except ImportError:
            # Fallback implementations if main not available
            TECHNICAL_TERMS = {
                "api", "json", "token", "llm", "gpt", "transformer", "embedding",
                "fine-tune", "fine-tuning", "rag", "vector", "prompt engineering",
                "chain-of-thought", "few-shot", "zero-shot", "temperature", "top-p",
            }
            def _count_technical_terms(text: str) -> int:
                lower = text.lower()
                return sum(1 for term in TECHNICAL_TERMS if term in lower)
            
            def _has_structured_patterns(text: str) -> bool:
                import re
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
            
            count_tech_fn = _count_technical_terms
            has_structure_fn = _has_structured_patterns
    
    features = [
        len(text),                                        # prompt_length
        len(text.split()),                                # word_count
        count_tech_fn(text),                              # tech_term_count
        1.0 if has_structure_fn(text) else 0.0,          # has_structure
        float(metrics.get("chars_per_second", 0)),
        float(metrics.get("session_message_count", 0)),
        float(metrics.get("avg_prompt_length", 0)),
        float(metrics.get("used_advanced_features_count", 0)),
        float(metrics.get("tooltip_click_count", 0)),
    ]
    return np.array(features, dtype=float)


def _create_synthetic_training_data():
    """Generate synthetic training data when no real data exists."""
    # L1 users: short prompts, no tech terms, low speed
    l1_samples = [
        ([20, 4, 0, 0, 1.5, 1, 20, 0, 2], 1),
        ([35, 6, 0, 0, 2.0, 2, 30, 0, 1], 1),
        ([15, 3, 0, 0, 1.0, 1, 15, 0, 3], 1),
        ([45, 8, 0, 0, 2.5, 3, 35, 0, 0], 1),
        ([30, 5, 0, 0, 1.8, 2, 28, 0, 2], 1),
    ]
    # L2 users: medium prompts, some tech terms
    l2_samples = [
        ([120, 22, 1, 0, 4.0, 5, 110, 1, 0], 2),
        ([95, 18, 2, 0, 5.0, 4, 100, 2, 0], 2),
        ([150, 28, 1, 1, 4.5, 6, 130, 1, 1], 2),
        ([85, 16, 2, 0, 5.5, 5, 90, 3, 0], 2),
        ([110, 20, 1, 1, 4.2, 7, 105, 2, 0], 2),
    ]
    # L3 users: long prompts, many tech terms, fast, uses advanced features
    l3_samples = [
        ([280, 55, 5, 1, 8.0, 12, 250, 4, 0], 3),
        ([350, 70, 7, 1, 9.5, 15, 300, 5, 0], 3),
        ([220, 45, 4, 1, 7.5, 10, 220, 3, 0], 3),
        ([400, 80, 8, 1, 10.0, 18, 380, 6, 0], 3),
        ([310, 62, 6, 1, 8.8, 14, 290, 4, 0], 3),
    ]
    
    X = np.array([s[0] for s in l1_samples + l2_samples + l3_samples], dtype=float)
    y = np.array([s[1] for s in l1_samples + l2_samples + l3_samples])
    return X, y


class SimpleLogisticClassifier:
    """Hand-implemented logistic regression for 3-class classification.
    Avoids scikit-learn dependency — pure numpy."""
    
    def __init__(self):
        self.weights = None
        self.bias = None
        self.feature_mean = None
        self.feature_std = None
        self.classes = [1, 2, 3]
        self.is_trained = False
    
    def _normalize(self, X: np.ndarray) -> np.ndarray:
        return (X - self.feature_mean) / (self.feature_std + 1e-8)
    
    def _softmax(self, z: np.ndarray) -> np.ndarray:
        e = np.exp(z - z.max(axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True)
    
    def fit(self, X: np.ndarray, y: np.ndarray, lr=0.01, epochs=500):
        self.feature_mean = X.mean(axis=0)
        self.feature_std = X.std(axis=0)
        X_norm = self._normalize(X)
        
        n_samples, n_features = X_norm.shape
        n_classes = 3
        self.weights = np.zeros((n_features, n_classes))
        self.bias = np.zeros(n_classes)
        
        # One-hot encode y (1,2,3 → 0,1,2)
        Y = np.zeros((n_samples, n_classes))
        for i, label in enumerate(y):
            Y[i, label - 1] = 1
        
        for _ in range(epochs):
            z = X_norm @ self.weights + self.bias
            probs = self._softmax(z)
            error = probs - Y
            self.weights -= lr * (X_norm.T @ error) / n_samples
            self.bias -= lr * error.mean(axis=0)
        
        self.is_trained = True
    
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        X_norm = self._normalize(X)
        z = X_norm @ self.weights + self.bias
        return self._softmax(z)
    
    def predict(self, X: np.ndarray) -> int:
        proba = self.predict_proba(X)
        return int(proba.argmax()) + 1  # +1 because classes are 1,2,3
    
    def save(self, path: Path):
        data = {
            "weights": self.weights.tolist(),
            "bias": self.bias.tolist(),
            "feature_mean": self.feature_mean.tolist(),
            "feature_std": self.feature_std.tolist(),
        }
        with open(path, "w") as f:
            json.dump(data, f)
    
    def load(self, path: Path):
        with open(path) as f:
            data = json.load(f)
        self.weights = np.array(data["weights"])
        self.bias = np.array(data["bias"])
        self.feature_mean = np.array(data["feature_mean"])
        self.feature_std = np.array(data["feature_std"])
        self.is_trained = True


# Global classifier instance
_classifier = SimpleLogisticClassifier()


def get_classifier() -> SimpleLogisticClassifier:
    global _classifier
    if not _classifier.is_trained:
        if MODEL_PATH.exists():
            try:
                _classifier.load(MODEL_PATH)
                logger.info("[ml] Model loaded from disk")
            except Exception as e:
                logger.warning(f"[ml] Failed to load model: {e}, training fresh")
                _train_fresh()
        else:
            _train_fresh()
    return _classifier


def _train_fresh():
    global _classifier
    X, y = _create_synthetic_training_data()
    _classifier.fit(X, y)
    try:
        _classifier.save(MODEL_PATH)
        logger.info("[ml] Model trained on synthetic data and saved")
    except Exception as e:
        logger.warning(f"[ml] Could not save model: {e}")


def ml_predict(prompt_text: str, metrics: dict, count_tech_fn=None, has_structure_fn=None) -> tuple[int, float]:
    """
    Returns (predicted_level: int, confidence: float)
    """
    try:
        clf = get_classifier()
        features = extract_features(prompt_text, metrics, count_tech_fn, has_structure_fn)
        proba = clf.predict_proba(features.reshape(1, -1))[0]
        predicted_class = int(proba.argmax()) + 1
        confidence = float(proba.max())
        return predicted_class, confidence
    except Exception as e:
        logger.error(f"[ml] Prediction failed: {e}")
        return 1, 0.0
