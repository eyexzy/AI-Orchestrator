import pytest
from fastapi import HTTPException

from routers.events import create_event, create_events_batch
from schemas.api import UserEventBatchCreate, UserEventCreate
from services.events import count_events_by_type, get_events_by_session

USER = "events@test.dev"


@pytest.mark.asyncio
async def test_event_routes_save_single_and_batch(db, req):
    single = await create_event(
        request=req(path="/events"),
        data=UserEventCreate(session_id="sess-1", chat_id="chat-1", event_type="prompt_started"),
        db=db,
        user_email=USER,
    )
    batch = await create_events_batch(
        request=req(path="/events/batch"),
        data=UserEventBatchCreate(
            events=[
                UserEventCreate(session_id="sess-1", chat_id="chat-1", event_type="tooltip_opened"),
                UserEventCreate(session_id="sess-1", chat_id="chat-1", event_type="prompt_submitted"),
            ]
        ),
        db=db,
        user_email=USER,
    )
    assert single.event_type == "prompt_started"
    assert batch.saved == 2
    rows = await get_events_by_session(db, "sess-1")
    assert len(rows) == 3
    counts = await count_events_by_type(db, "sess-1")
    assert counts["tooltip_opened"] == 1
    assert counts["prompt_submitted"] == 1


@pytest.mark.asyncio
async def test_event_routes_reject_unknown_event_type(db, req):
    with pytest.raises(HTTPException) as exc:
        await create_event(
            request=req(path="/events"),
            data=UserEventCreate(session_id="sess-2", chat_id="chat-2", event_type="not_real"),
            db=db,
            user_email=USER,
        )
    assert exc.value.status_code == 422
