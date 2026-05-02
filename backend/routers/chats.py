import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from database import ChatMessage, ChatSession, Project
from dependencies import get_current_user, get_db, limiter
from schemas.api import (
    ChatSearchResult,
    CreateChatRequest,
    ForkChatRequest,
    UpdateChatRequest,
)

RATE_LIMIT_CHAT_SEARCH = "60/minute"

router = APIRouter()


def _message_to_response(message: ChatMessage) -> dict:
    try:
        metadata = json.loads(message.metadata_json or "{}")
        if not isinstance(metadata, dict):
            metadata = {}
    except (TypeError, json.JSONDecodeError):
        metadata = {}

    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "metadata": metadata,
    }


def _chat_to_response(
    session: ChatSession,
    *,
    message_count: int = 0,
    project_name: str | None = None,
    parent_chat_title: str | None = None,
) -> dict:
    return {
        "id": session.id,
        "title": session.title,
        "is_favorite": session.is_favorite or False,
        "project_id": session.project_id,
        "project_name": project_name,
        "parent_chat_id": session.parent_chat_id,
        "parent_chat_title": parent_chat_title,
        "forked_from_message_id": session.forked_from_message_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        "message_count": message_count,
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


async def _get_owned_project(
    db: AsyncSession,
    project_id: str,
    user_email: str,
) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_email == user_email,
        )
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/chats")
async def list_chats(
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    ParentChat = aliased(ChatSession)
    stmt = (
        select(
            ChatSession,
            Project.name.label("project_name"),
            ParentChat.title.label("parent_chat_title"),
            func.count(ChatMessage.id).label("msg_count"),
        )
        .outerjoin(Project, ChatSession.project_id == Project.id)
        .outerjoin(ParentChat, ChatSession.parent_chat_id == ParentChat.id)
        .outerjoin(ChatMessage, ChatSession.id == ChatMessage.session_id)
        .where(ChatSession.user_email == user_email)
        .group_by(ChatSession.id, Project.name, ParentChat.title)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        _chat_to_response(
            session,
            message_count=msg_count,
            project_name=project_name,
            parent_chat_title=parent_chat_title,
        )
        for session, project_name, parent_chat_title, msg_count in rows
    ]


@router.post("/chats")
async def create_chat(
    req: CreateChatRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    project_id = None
    if req.project_id:
        project = await _get_owned_project(db, req.project_id, user_email)
        project_id = project.id

    session = ChatSession(
        user_email=user_email,
        title=req.title,
        project_id=project_id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    project_name = None
    if project_id:
        project_name = (await _get_owned_project(db, project_id, user_email)).name

    return _chat_to_response(session, message_count=0, project_name=project_name)


@router.post("/chats/{chat_id}/fork")
async def fork_chat(
    chat_id: str,
    req: ForkChatRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    source_session = await _get_owned_chat_session(db, chat_id, user_email)

    source_message = (
        await db.execute(
            select(ChatMessage).where(
                ChatMessage.id == req.message_id,
                ChatMessage.session_id == chat_id,
            )
        )
    ).scalars().first()
    if not source_message:
        raise HTTPException(status_code=404, detail="Message not found")

    request_data = req.model_dump(exclude_unset=True)
    target_project_id = source_session.project_id
    project_name = None

    if "project_id" in request_data:
        if req.project_id is None:
            target_project_id = None
        else:
            project = await _get_owned_project(db, req.project_id, user_email)
            target_project_id = project.id
            project_name = project.name
    elif source_session.project_id:
        project = await _get_owned_project(db, source_session.project_id, user_email)
        project_name = project.name

    fork_title = (req.title or f"{source_session.title} (Fork)")[:255]
    forked_session = ChatSession(
        user_email=user_email,
        title=fork_title,
        project_id=target_project_id,
        parent_chat_id=source_session.id,
        forked_from_message_id=req.message_id,
    )
    db.add(forked_session)

    await db.commit()
    await db.refresh(forked_session)
    return _chat_to_response(
        forked_session,
        message_count=0,
        project_name=project_name,
        parent_chat_title=source_session.title,
    )


@limiter.limit(RATE_LIMIT_CHAT_SEARCH)
@router.get("/chats/search")
async def search_chats(
    request: Request,
    query: str = Query(..., min_length=2, max_length=200),
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    pattern = f"%{query}%"
    results: list[dict] = []
    seen_chat_ids: set[str] = set()

    msg_stmt = (
        select(ChatMessage, ChatSession, Project.name.label("project_name"))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .outerjoin(Project, ChatSession.project_id == Project.id)
        .where(
            ChatSession.user_email == user_email,
            ChatMessage.content.ilike(pattern),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    msg_rows = (await db.execute(msg_stmt)).all()
    for msg, chat, project_name in msg_rows:
        results.append(
            ChatSearchResult(
                chat_id=chat.id,
                chat_title=chat.title,
                project_id=chat.project_id,
                project_name=project_name,
                parent_chat_id=chat.parent_chat_id,
                forked_from_message_id=chat.forked_from_message_id,
                message_id=msg.id,
                message_content=msg.content[:150],
                role=msg.role,
                updated_at=(msg.created_at or chat.updated_at).isoformat()
                if hasattr(msg.created_at or chat.updated_at, "isoformat")
                else "",
            ).model_dump()
        )
        seen_chat_ids.add(chat.id)

    title_stmt = (
        select(ChatSession, Project.name.label("project_name"))
        .outerjoin(Project, ChatSession.project_id == Project.id)
        .where(
            ChatSession.user_email == user_email,
            ChatSession.title.ilike(pattern),
        )
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )
    title_rows = (await db.execute(title_stmt)).all()
    for chat, project_name in title_rows:
        if chat.id in seen_chat_ids:
            continue
        results.append(
            ChatSearchResult(
                chat_id=chat.id,
                chat_title=chat.title,
                project_id=chat.project_id,
                project_name=project_name,
                parent_chat_id=chat.parent_chat_id,
                forked_from_message_id=chat.forked_from_message_id,
                message_id=None,
                message_content=None,
                role=None,
                updated_at=chat.updated_at.isoformat() if chat.updated_at else "",
            ).model_dump()
        )

    results.sort(key=lambda item: item["updated_at"], reverse=True)
    return results[offset:offset + limit]


@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    session = await _get_owned_chat_session(db, chat_id, user_email)
    stmt = select(ChatMessage).where(ChatMessage.session_id == chat_id)
    if session.parent_chat_id and session.forked_from_message_id and session.created_at:
        stmt = stmt.where(ChatMessage.created_at >= session.created_at)
    result = await db.execute(stmt.order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()))
    messages = result.scalars().all()
    return [_message_to_response(message) for message in messages]


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
    updates = req.model_dump(exclude_unset=True)

    if "title" in updates:
        session.title = req.title
    if "is_favorite" in updates:
        session.is_favorite = req.is_favorite
    if "project_id" in updates:
        if req.project_id is None:
            session.project_id = None
        else:
            project = await _get_owned_project(db, req.project_id, user_email)
            session.project_id = project.id

    await db.commit()
    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    session = await _get_owned_chat_session(db, chat_id, user_email)
    await db.execute(delete(ChatSession).where(ChatSession.id == chat_id))
    await db.commit()
    return {"ok": True}
