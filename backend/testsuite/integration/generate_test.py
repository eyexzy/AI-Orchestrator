import pytest
from fastapi import HTTPException
from sqlalchemy import select

from database import ChatMessage, ChatSession
from routers import generate as generate_router
from schemas.api import GenerateRequest, GenerateResponse, MultiGenerateRequest, RefineRequest, UsageStats

USER = "generate@test.dev"


def _result(text: str, model: str) -> GenerateResponse:
    return GenerateResponse(
        text=text,
        usage=UsageStats(
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30,
            model=model,
            temperature=0.7,
            latency_ms=12,
        ),
        raw={},
        provider="mock",
    )


@pytest.mark.asyncio
async def test_generate_requires_auth_for_persisted_chat(db, req):
    with pytest.raises(HTTPException) as exc:
        await generate_router.generate(
            request=req(path="/generate"),
            body=GenerateRequest(prompt="Hello", model="gpt-4o-mini", session_id="chat-1"),
            db=db,
            user_email=None,
        )
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_generate_persists_chat_and_messages(db, req, monkeypatch):
    async def fake_generate_once(body):
        return _result("Ready", body.model)

    monkeypatch.setattr(generate_router, "_generate_once", fake_generate_once)
    result = await generate_router.generate(
        request=req(path="/generate"),
        body=GenerateRequest(prompt="Explain prompting", model="gpt-4o-mini", session_id="chat-2"),
        db=db,
        user_email=USER,
    )
    assert result.text == "Ready"
    chat = await db.execute(select(ChatSession).where(ChatSession.id == "chat-2"))
    messages = await db.execute(select(ChatMessage).where(ChatMessage.session_id == "chat-2").order_by(ChatMessage.id))
    chat_row = chat.scalars().first()
    message_rows = messages.scalars().all()
    assert chat_row is not None
    assert chat_row.user_email == USER
    assert len(message_rows) == 2
    assert [item.role for item in message_rows] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_generate_multi_compare_persists_comparison_metadata(db, req, monkeypatch):
    async def fake_generate_once(body):
        return _result(f"text-{body.model}", body.model)

    monkeypatch.setattr(generate_router, "_generate_once", fake_generate_once)
    result = await generate_router.generate_multi(
        request=req(path="/generate/multi"),
        body=MultiGenerateRequest(
            prompt="Compare two answers",
            model="gpt-4o-mini",
            compare_model="gemini-2.0-flash",
            session_id="chat-3",
            mode="compare",
        ),
        db=db,
        user_email=USER,
    )
    metadata = result["assistant_message"]["metadata"]
    assert metadata["isCompare"] is True
    assert metadata["comparison"]["modelA"]["model"] == "gpt-4o-mini"
    assert metadata["comparison"]["modelB"]["model"] == "gemini-2.0-flash"


@pytest.mark.asyncio
async def test_refine_returns_error_when_tutor_review_is_unavailable(req, monkeypatch):
    async def fail(prompt: str, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(generate_router, "refine_prompt_with_llm", fail)

    with pytest.raises(HTTPException) as exc:
        await generate_router.refine(
            request=req(path="/refine"),
            body=RefineRequest(prompt="make it better"),
        )

    assert exc.value.status_code == 502
    assert exc.value.detail == "tutor_review_unavailable"
