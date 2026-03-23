import pytest
from fastapi import HTTPException
from sqlalchemy import select

from database import ChatMessage, ChatSession
from routers.chats import create_chat, delete_chat, get_chat_messages, list_chats, search_chats, truncate_chat_messages, update_chat
from schemas.api import CreateChatRequest, UpdateChatRequest

USER = "chat@test.dev"
OTHER = "other@test.dev"


@pytest.mark.asyncio
async def test_chat_flow(db):
    created = await create_chat(CreateChatRequest(user_email=OTHER, title="Alpha"), db=db, user_email=USER)
    chat_id = created["id"]
    db.add_all([
        ChatMessage(session_id=chat_id, role="user", content="First prompt"),
        ChatMessage(session_id=chat_id, role="assistant", content="Assistant answer"),
    ])
    await db.commit()
    chats = await list_chats(db=db, user_email=USER, limit=50, offset=0)
    assert len(chats) == 1
    assert chats[0]["title"] == "Alpha"
    assert chats[0]["message_count"] == 2
    messages = await get_chat_messages(chat_id=chat_id, db=db, user_email=USER)
    assert [item["role"] for item in messages] == ["user", "assistant"]
    hits = await search_chats(query="Assistant", db=db, user_email=USER, limit=20, offset=0)
    assert any(item["chat_id"] == chat_id for item in hits)
    await update_chat(chat_id=chat_id, req=UpdateChatRequest(title="Beta", is_favorite=True), db=db, user_email=USER)
    chats = await list_chats(db=db, user_email=USER, limit=50, offset=0)
    assert chats[0]["title"] == "Beta"
    assert chats[0]["is_favorite"] is True
    truncated = await truncate_chat_messages(chat_id=chat_id, after_id=messages[0]["id"], db=db, user_email=USER)
    assert truncated["ok"] is True
    assert truncated["deleted"] == 1
    messages = await get_chat_messages(chat_id=chat_id, db=db, user_email=USER)
    assert len(messages) == 1
    deleted = await delete_chat(chat_id=chat_id, db=db, user_email=USER)
    assert deleted["ok"] is True
    result = await db.execute(select(ChatSession).where(ChatSession.id == chat_id))
    assert result.scalars().first() is None


@pytest.mark.asyncio
async def test_chat_is_user_scoped(db):
    created = await create_chat(CreateChatRequest(title="Private"), db=db, user_email=USER)
    with pytest.raises(HTTPException) as exc:
        await get_chat_messages(chat_id=created["id"], db=db, user_email=OTHER)
    assert exc.value.status_code == 404
