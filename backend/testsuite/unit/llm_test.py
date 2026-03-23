from schemas.api import GenerateRequest, HistoryMessage
from services import llm


def test_build_messages_applies_system_and_history_limit():
    req = GenerateRequest(
        prompt="Final prompt",
        system_message="Be precise",
        history=[
            HistoryMessage(role="user", content="one"),
            HistoryMessage(role="assistant", content="two"),
            HistoryMessage(role="user", content="three"),
        ],
        history_limit=2,
    )
    messages = llm.build_messages(req)
    assert messages[0]["role"] == "system"
    assert "Be precise" in messages[0]["content"]
    assert [item["content"] for item in messages[1:]] == ["two", "three", "Final prompt"]


def test_estimate_tokens_never_returns_zero():
    assert llm.estimate_tokens("") == 1
    assert llm.estimate_tokens("abcd" * 10) >= 1


def test_get_client_for_unknown_model_returns_none():
    client, model_info = llm.get_client_for_model("missing-model")
    assert client is None
    assert model_info is None


def test_get_mock_mode_uses_legacy_flag(monkeypatch):
    monkeypatch.delenv("LLM_MOCK_MODE", raising=False)
    monkeypatch.setenv("ALLOW_MOCK", "true")
    assert llm.get_mock_mode() == "fallback"
