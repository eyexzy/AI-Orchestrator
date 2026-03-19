import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import ChatSession, ChatMessage
from dependencies import get_current_user, get_db
from schemas.api import CreateChatRequest, UpdateChatRequest, ChatSearchResult

router = APIRouter()


def _message_to_response(message: ChatMessage) -> dict:
    try:
        metadata = json.loads(message.metadata_json or "{}")
        if not isinstance(metadata, dict):
            metadata = {}
    except (TypeError, json.JSONDecodeError):
        metadata = {}

    return {
        "id":         message.id,
        "role":       message.role,
        "content":    message.content,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "metadata":   metadata,
    }


async def _get_owned_chat_session(
    db: AsyncSession,
    chat_id: str,
    user_email: str,
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == chat_id,
            ChatSession.user_email == user_email,
        )
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat not found")
    return session


@router.get("/chats")
async def list_chats(
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(ChatSession, func.count(ChatMessage.id).label("msg_count"))
        .outerjoin(ChatMessage, ChatSession.id == ChatMessage.session_id)
        .where(ChatSession.user_email == user_email)
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id":            s.id,
            "title":         s.title,
            "is_favorite":   s.is_favorite or False,
            "created_at":    s.created_at.isoformat() if s.created_at else None,
            "updated_at":    s.updated_at.isoformat() if s.updated_at else None,
            "message_count": msg_count,
        }
        for s, msg_count in rows
    ]


@router.post("/chats")
async def create_chat(
    req: CreateChatRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    # user_email from JWT overrides anything in the request body
    session = ChatSession(user_email=user_email, title=req.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {
        "id":            session.id,
        "title":         session.title,
        "is_favorite":   session.is_favorite or False,
        "created_at":    session.created_at.isoformat() if session.created_at else None,
        "updated_at":    session.updated_at.isoformat() if session.updated_at else None,
        "message_count": 0,
    }


@router.get("/chats/search")
async def search_chats(
    query: str = Query(..., max_length=200),
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    pattern = f"%{query}%"
    results: list[dict] = []
    seen_chat_ids: set[str] = set()

    # 1) Messages whose content matches
    msg_stmt = (
        select(ChatMessage, ChatSession)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatSession.user_email == user_email,
            ChatMessage.content.ilike(pattern),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    msg_rows = (await db.execute(msg_stmt)).all()
    for msg, chat in msg_rows:
        snippet = msg.content[:150]
        results.append({
            "chat_id":         chat.id,
            "chat_title":      chat.title,
            "message_id":      msg.id,
            "message_content": snippet,
            "role":            msg.role,
            "updated_at":      (msg.created_at or chat.updated_at or "").isoformat()
                               if hasattr(msg.created_at or chat.updated_at, "isoformat")
                               else "",
        })
        seen_chat_ids.add(chat.id)

    # 2) Chats whose title matches (not already covered by message hits)
    title_stmt = (
        select(ChatSession)
        .where(
            ChatSession.user_email == user_email,
            ChatSession.title.ilike(pattern),
        )
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )
    title_rows = (await db.execute(title_stmt)).scalars().all()
    for chat in title_rows:
        if chat.id not in seen_chat_ids:
            results.append({
                "chat_id":         chat.id,
                "chat_title":      chat.title,
                "message_id":      None,
                "message_content": None,
                "role":            None,
                "updated_at":      chat.updated_at.isoformat() if chat.updated_at else "",
            })

    # Sort combined results by updated_at desc, apply offset/limit
    results.sort(key=lambda r: r["updated_at"], reverse=True)
    return results[offset:offset + limit]


@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    await _get_owned_chat_session(db, chat_id, user_email)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
    )
    msgs = result.scalars().all()
    return [_message_to_response(m) for m in msgs]


@router.delete("/chats/{chat_id}/messages/truncate")
async def truncate_chat_messages(
    chat_id: str,
    after_id: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    session = await _get_owned_chat_session(db, chat_id, user_email)

    if after_id > 0:
        result = await db.execute(
            select(ChatMessage.id).where(
                ChatMessage.id == after_id,
                ChatMessage.session_id == chat_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Message not found")

    stmt = delete(ChatMessage).where(ChatMessage.session_id == chat_id)
    if after_id > 0:
        stmt = stmt.where(ChatMessage.id > after_id)

    result = await db.execute(stmt)
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()

    deleted = result.rowcount if result.rowcount is not None else 0
    return {"ok": True, "deleted": deleted}


@router.patch("/chats/{chat_id}")
async def update_chat(
    chat_id: str,
    req: UpdateChatRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    session = await _get_owned_chat_session(db, chat_id, user_email)
    if req.title is not None:
        session.title = req.title
    if req.is_favorite is not None:
        session.is_favorite = req.is_favorite
    await db.commit()
    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    session = await _get_owned_chat_session(db, chat_id, user_email)
    await db.delete(session)
    await db.commit()
    return {"ok": True}