"""
Events router — ingests raw user behavioral events.

Endpoints:
  POST /events — single event
  POST /events/batch — up to 50 events at once
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import RATE_LIMIT_EVENTS, RATE_LIMIT_EVENTS_BATCH, get_current_user, get_db, limiter
from schemas.api import (
    UserEventBatchCreate,
    UserEventBatchResponse,
    UserEventCreate,
    UserEventResponse,
)
from services.events import ALLOWED_EVENT_TYPES, save_event, save_events_batch

logger = logging.getLogger("ai-orchestrator")

router = APIRouter(prefix="/events", tags=["events"])


def _validate_event_type(event_type: str) -> None:
    if event_type not in ALLOWED_EVENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown event_type '{event_type}'. Allowed: {sorted(ALLOWED_EVENT_TYPES)}",
        )


@limiter.limit(RATE_LIMIT_EVENTS)
@router.post("", response_model=UserEventResponse)
async def create_event(
    request: Request,
    data: UserEventCreate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    _validate_event_type(data.event_type)
    event = await save_event(
        db,
        user_email=user_email,
        session_id=data.session_id,
        chat_id=data.chat_id,
        event_type=data.event_type,
        event_context=data.event_context,
        payload=data.payload,
    )
    await db.commit()
    return UserEventResponse(
        id=event.id,
        user_email=event.user_email,
        session_id=event.session_id,
        chat_id=event.chat_id,
        event_type=event.event_type,
        event_context=data.event_context,
        payload=data.payload,
        created_at=event.created_at,
    )


@limiter.limit(RATE_LIMIT_EVENTS_BATCH)
@router.post("/batch", response_model=UserEventBatchResponse)
async def create_events_batch(
    request: Request,
    data: UserEventBatchCreate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    for ev in data.events:
        _validate_event_type(ev.event_type)

    saved = await save_events_batch(
        db,
        user_email=user_email,
        events=[ev.model_dump() for ev in data.events],
    )
    await db.commit()
    return UserEventBatchResponse(ok=True, saved=saved)
