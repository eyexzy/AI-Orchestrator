import pytest
from pydantic import ValidationError

from schemas.api import GenerateRequest, HistoryMessage, InlineAttachment, UserEventCreate


def test_generate_request_rejects_oversized_history_volume():
    history = [HistoryMessage(role="user", content="a" * 20000) for _ in range(11)]
    with pytest.raises(ValidationError):
        GenerateRequest(prompt="hello", history=history)


def test_generate_request_rejects_too_many_inline_attachments():
    attachments = [
        InlineAttachment(filename=f"f{i}.txt", mime_type="text/plain", data="YQ==")
        for i in range(5)
    ]
    with pytest.raises(ValidationError):
        GenerateRequest(prompt="hello", inline_attachments=attachments)


def test_user_event_rejects_large_payload():
    with pytest.raises(ValidationError):
        UserEventCreate(
            event_type="chat_opened",
            payload={"blob": "x" * 40000},
        )
