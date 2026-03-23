import numpy as np

from ml_classifier import SklearnClassifier, _create_synthetic_training_data, extract_behavioral_features, extract_features, ml_predict, ml_predict_batch


def test_extract_behavioral_features_shape():
    features = extract_behavioral_features(
        "Write a Python study plan in bullet points.",
        {
            "chars_per_second": 3.1,
            "session_message_count": 4,
            "avg_prompt_length": 42,
            "used_advanced_features_count": 2,
            "tooltip_click_count": 1,
        },
    )
    assert features.shape == (8,)
    assert features[2] in (0.0, 1.0)


def test_extract_features_includes_semantic_slot():
    features = extract_features(
        "Explain async programming with examples.",
        {"chars_per_second": 2.0},
        get_score_fn=lambda _: 0.75,
        has_structure_fn=lambda _: True,
    )
    assert features.shape == (9,)
    assert features[2] == 0.75


def test_ml_predict_returns_level_and_confidence():
    texts, behavioral_x, y = _create_synthetic_training_data()
    clf = SklearnClassifier()
    clf.fit(texts, behavioral_x, y)
    import ml_classifier

    ml_classifier._classifier = clf
    level, confidence = ml_predict(
        "Create a structured ML evaluation plan with metrics and CV.",
        {
            "chars_per_second": 4.0,
            "session_message_count": 5,
            "avg_prompt_length": 60,
            "used_advanced_features_count": 2,
            "tooltip_click_count": 0,
        },
    )
    assert level in (1, 2, 3)
    assert 0.0 <= confidence <= 1.0


def test_ml_predict_batch_truncates_mismatched_inputs():
    texts, behavioral_x, y = _create_synthetic_training_data()
    clf = SklearnClassifier()
    clf.fit(texts, behavioral_x, y)
    import ml_classifier

    ml_classifier._classifier = clf
    result = ml_predict_batch(
        ["one", "two", "three"],
        [{"chars_per_second": 1.0}, {"chars_per_second": 2.0}],
        has_structure_fn=lambda _: False,
    )
    assert len(result) == 2
    assert all(item[0] in (1, 2, 3) for item in result)


def test_classifier_serialization_round_trip():
    texts, behavioral_x, y = _create_synthetic_training_data()
    clf = SklearnClassifier()
    clf.fit(texts, behavioral_x, y)
    payload = clf.to_dict()
    restored = SklearnClassifier()
    restored.from_dict(payload)
    behavior = np.array([[30.0, 5.0, 0.0, 2.0, 1.0, 30.0, 0.0, 1.0]])
    proba = restored.predict_proba(["simple prompt"], behavior)
    assert proba.shape == (1, 3)
