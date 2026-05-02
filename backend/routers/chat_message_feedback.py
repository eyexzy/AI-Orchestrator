import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import ChatMessage, ChatMessageFeedback, ChatSession
from dependencies import get_current_user, get_db, limiter
from schemas.api import ChatMessageFeedbackRequest, ChatMessageFeedbackResponse

router = APIRouter()


def _parse_metadata(message: ChatMessage) -> dict:
    try:
        metadata = json.loads(message.metadata_json or "{}")
        if not isinstance(metadata, dict):
            return {}
        return metadata
    except (TypeError, json.JSONDecodeError):
        return {}


def _provider_generation_id_from_metadata(metadata: dict) -> str | None:
    value = metadata.get("provider_generation_id")
    if isinstance(value, str) and value.strip():
        return value

    summary = metadata.get("generation_summary")
    if isinstance(summary, dict):
        nested = summary.get("provider_generation_id")
        if isinstance(nested, str) and nested.strip():
            return nested

    return None


def _model_id_from_metadata(metadata: dict) -> str | None:
    for key in ("model_id",):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value

    request_options = metadata.get("request_options")
    if isinstance(request_options, dict):
        value = request_options.get("model_id")
        if isinstance(value, str) and value.strip():
            return value

    return None


def _provider_from_metadata(metadata: dict) -> str | None:
    value = metadata.get("provider")
    if isinstance(value, str) and value.strip():
        return value

    summary = metadata.get("generation_summary")
    if isinstance(summary, dict):
        nested = summary.get("provider")
        if isinstance(nested, str) and nested.strip():
            return nested

    return None


def _apply_feedback_metadata(metadata: dict, vote: str | None) -> dict:
    next_metadata = dict(metadata)
    if vote is None:
        next_metadata.pop("user_feedback", None)
        return next_metadata

    next_metadata["user_feedback"] = {
        "vote": vote,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "provider_forwarded": False,
        "provider_forwarding_supported": False,
    }
    return next_metadata


async def _get_owned_assistant_message(
    db: AsyncSession,
    message_id: int,
    user_email: str,
) -> ChatMessage:
    result = await db.execute(
        select(ChatMessage)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatMessage.id == message_id,
            ChatMessage.role == "assistant",
            ChatSession.user_email == user_email,
        )
    )
    message = result.scalars().first()
    if not message:
        raise HTTPException(status_code=404, detail="Assistant message not found")
    return message


@limiter.limit("60/minute")
@router.post("/chat-messages/{message_id}/feedback", response_model=ChatMessageFeedbackResponse)
async def save_chat_message_feedback(
    request: Request,
    message_id: int,
    body: ChatMessageFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    message = await _get_owned_assistant_message(db, message_id, user_email)
    metadata = _parse_metadata(message)
    provider_generation_id = _provider_generation_id_from_metadata(metadata)

    existing_result = await db.execute(
        select(ChatMessageFeedback).where(
            ChatMessageFeedback.message_id == message.id,
            ChatMessageFeedback.user_email == user_email,
        )
    )
    row = existing_result.scalars().first()

    if row is None:
        row = ChatMessageFeedback(
            message_id=message.id,
            session_id=message.session_id,
            user_email=user_email,
        )
        db.add(row)

    row.vote = body.vote
    row.provider = _provider_from_metadata(metadata)
    row.model_id = _model_id_from_metadata(metadata)
    row.provider_generation_id = provider_generation_id
    row.message_content = message.content or ""
    row.provider_forwarded = False

    message.metadata_json = json.dumps(
        _apply_feedback_metadata(metadata, body.vote),
        ensure_ascii=False,
    )

    await db.commit()

    return ChatMessageFeedbackResponse(
        ok=True,
        vote=body.vote,
        provider_forwarded=False,
        provider_forwarding_supported=False,
        provider_generation_id=provider_generation_id,
    )


@limiter.limit("60/minute")
@router.delete("/chat-messages/{message_id}/feedback", response_model=ChatMessageFeedbackResponse)
async def delete_chat_message_feedback(
    request: Request,
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    message = await _get_owned_assistant_message(db, message_id, user_email)
    metadata = _parse_metadata(message)

    result = await db.execute(
        select(ChatMessageFeedback).where(
            ChatMessageFeedback.message_id == message.id,
            ChatMessageFeedback.user_email == user_email,
        )
    )
    row = result.scalars().first()
    if row is not None:
        await db.delete(row)

    message.metadata_json = json.dumps(
        _apply_feedback_metadata(metadata, None),
        ensure_ascii=False,
    )
    await db.commit()

    return ChatMessageFeedbackResponse(
        ok=True,
        vote=None,
        provider_forwarded=False,
        provider_forwarding_supported=False,
        provider_generation_id=_provider_generation_id_from_metadata(metadata),
    )
