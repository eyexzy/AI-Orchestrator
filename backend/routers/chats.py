import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import ChatSession, ChatMessage
from dependencies import check_admin_key, get_db
from schemas.api import CreateChatRequest, UpdateChatRequest

router = APIRouter()


@router.get("/chats")
async def list_chats(
    user_email: str = "anonymous",
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
):
    stmt = (
        select(ChatSession, func.count(ChatMessage.id).label("msg_count"))
        .outerjoin(ChatMessage, ChatSession.id == ChatMessage.session_id)
        .where(ChatSession.user_email == user_email)
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id":            s.id,
            "title":         s.title,
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
    _api_key: str = Depends(check_admin_key),
):
    session = ChatSession(user_email=req.user_email, title=req.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {
        "id":            session.id,
        "title":         session.title,
        "created_at":    session.created_at.isoformat() if session.created_at else None,
        "updated_at":    session.updated_at.isoformat() if session.updated_at else None,
        "message_count": 0,
    }


@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == chat_id)
    )
    session = result.scalars().first()
    if not session:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
    )
    msgs = result.scalars().all()
    return [
        {
            "id":         m.id,
            "role":       m.role,
            "content":    m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "metadata":   json.loads(m.metadata_json) if m.metadata_json else {},
        }
        for m in msgs
    ]


@router.patch("/chats/{chat_id}")
async def update_chat(
    chat_id: str,
    req: UpdateChatRequest,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == chat_id)
    )
    session = result.scalars().first()
    if not session:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    session.title = req.title
    await db.commit()
    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == chat_id)
    )
    session = result.scalars().first()
    if not session:
        return JSONResponse(status_code=404, content={"error": "Chat not found"})
    await db.delete(session)
    await db.commit()
    return {"ok": True}
