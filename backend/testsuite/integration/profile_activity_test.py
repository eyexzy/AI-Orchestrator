from datetime import datetime, timezone

import pytest

from database import ChatMessage, ChatSession, UserEvent
from routers.profile import get_profile_activity

USER = "activity@test.dev"


@pytest.mark.asyncio
async def test_profile_activity_counts_only_chat_messages(db, req):
    created_at = datetime.now(timezone.utc)
    session = ChatSession(id="activity-chat", user_email=USER, title="Activity")
    db.add(session)
    db.add_all(
        [
            ChatMessage(
                session_id=session.id,
                role="user",
                content="Prompt",
                created_at=created_at,
            ),
            ChatMessage(
                session_id=session.id,
                role="assistant",
                content="Answer",
                created_at=created_at,
            ),
            UserEvent(
                user_email=USER,
                session_id="session-1",
                chat_id=session.id,
                event_type="ui_click",
                event_context_json="{}",
                payload_json="{}",
                created_at=created_at,
            ),
        ]
    )
    await db.commit()

    result = await get_profile_activity(
        request=req(path="/profile/activity", method="GET"),
        user_email=USER,
        db=db,
    )

    day = created_at.date().isoformat()
    assert result["days"] == [{"date": day, "count": 2}]
    assert result["total_messages"] == 2
    assert result["total_events"] == 2
