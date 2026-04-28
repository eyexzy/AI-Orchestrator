import json
from types import SimpleNamespace

import pytest

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



class _FakeCompletions:
    def __init__(self, handler):
        self._handler = handler

    async def create(self, **kwargs):
        return await self._handler(**kwargs)


class _FakeClient:
    def __init__(self, handler):
        self.chat = SimpleNamespace(completions=_FakeCompletions(handler))


@pytest.mark.asyncio
async def test_refine_prompt_falls_back_to_next_provider(monkeypatch):
    calls: list[str] = []

    async def fail_create(**kwargs):
        calls.append(kwargs["model"])
        raise RuntimeError("insufficient_quota")

    async def success_create(**kwargs):
        calls.append(kwargs["model"])
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(
                            {
                                "opening_message": "Your prompt has a clear goal.",
                                "strengths": ["The task is already recognizable."],
                                "gaps": ["The output format is still unclear."],
                                "clarifying_questions": [
                                    {"id": "q1", "question": "Who is the audience?"},
                                    {"id": "q2", "question": "What format do you want?"},
                                    {"id": "q3", "question": "What should the answer include?"},
                                ],
                                "improved_prompt": "Write a structured explanation for beginners with bullet points and one example.",
                                "why_this_is_better": ["It defines the audience.", "It defines the format."],
                                "next_step": "Add a success criterion.",
                            }
                        )
                    )
                )
            ]
        )

    # All models are now via openrouter; haiku fails, sonnet succeeds
    async def dispatch_create(**kwargs):
        if kwargs["model"] == "anthropic/claude-haiku-4-5-20251001":
            return await fail_create(**kwargs)
        return await success_create(**kwargs)

    monkeypatch.setattr(
        llm,
        "clients",
        {"openrouter": _FakeClient(dispatch_create)},
    )

    review = await llm.refine_prompt_with_llm(
        "Help me explain recursion",
        language="en",
        level=1,
    )

    assert review["improved_prompt"].startswith("Write a structured explanation")
    assert len(review["clarifying_questions"]) == 3
    assert calls[0] == "anthropic/claude-haiku-4-5-20251001"
    assert calls[1] == "anthropic/claude-sonnet-4-5"
