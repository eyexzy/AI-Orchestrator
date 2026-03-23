from ml_classifier import _create_synthetic_training_data
from retrain import train_and_evaluate


def test_train_and_evaluate_handles_small_dataset():
    texts, behavioral_x, y = _create_synthetic_training_data()
    result = train_and_evaluate(texts[:6], behavioral_x[:6], y[:6], model_type="LogisticRegression")
    assert result["samples_total"] == 6
    assert bool(result["had_proper_split"]) is False
    assert result["model_type"] == "LogisticRegression"


def test_train_and_evaluate_handles_proper_split():
    texts, behavioral_x, y = _create_synthetic_training_data()
    result = train_and_evaluate(texts[:15], behavioral_x[:15], y[:15], model_type="LogisticRegression")
    assert result["samples_total"] == 15
    assert result["accuracy"] >= 0.0
    assert result["f1_macro"] >= 0.0
    assert "classifier" in result
