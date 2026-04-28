import pytest

from routers.chats import create_chat, fork_chat, get_chat_messages, search_chats, update_chat
from routers.projects import create_project, delete_project, get_project, list_projects, update_project
from database import ChatMessage
from schemas.api import CreateChatRequest, ForkChatRequest, ProjectCreate, ProjectUpdate, UpdateChatRequest

USER = "projects@test.dev"
OTHER = "other@test.dev"


@pytest.mark.asyncio
async def test_project_crud_and_chat_assignment(db):
    created_project = await create_project(
        ProjectCreate(
            name="Research",
            description="Prompt engineering notes",
            accent_color="purple",
            icon_name="graduation",
            starter_prompt="Summarize the next source",
            system_hint="Stay aligned with the thesis goal",
            is_favorite=True,
        ),
        db=db,
        user_email=USER,
    )
    project_id = created_project["id"]
    assert created_project["accent_color"] == "purple"
    assert created_project["icon_name"] == "graduation"
    assert created_project["starter_prompt"] == "Summarize the next source"
    assert created_project["system_hint"] == "Stay aligned with the thesis goal"
    assert created_project["is_favorite"] is True

    created_chat = await create_chat(
        CreateChatRequest(title="Scoped chat", project_id=project_id),
        db=db,
        user_email=USER,
    )
    assert created_chat["project_id"] == project_id
    assert created_chat["project_name"] == "Research"

    projects = await list_projects(db=db, user_email=USER, limit=50, offset=0)
    assert len(projects) == 1
    assert projects[0]["chat_count"] == 1
    assert projects[0]["is_favorite"] is True

    updated_project = await update_project(
        project_id=project_id,
        req=ProjectUpdate(
            name="Research v2",
            accent_color="teal",
            icon_name="brain",
            starter_prompt="Draft an outline",
            system_hint="Use academic tone",
            is_favorite=False,
        ),
        db=db,
        user_email=USER,
    )
    assert updated_project["name"] == "Research v2"
    assert updated_project["accent_color"] == "teal"
    assert updated_project["icon_name"] == "brain"
    assert updated_project["starter_prompt"] == "Draft an outline"
    assert updated_project["system_hint"] == "Use academic tone"
    assert updated_project["is_favorite"] is False

    fetched_project = await get_project(project_id=project_id, db=db, user_email=USER)
    assert fetched_project["id"] == project_id
    assert fetched_project["chat_count"] == 1

    await update_chat(
        chat_id=created_chat["id"],
        req=UpdateChatRequest(project_id=None),
        db=db,
        user_email=USER,
    )
    projects = await list_projects(db=db, user_email=USER, limit=50, offset=0)
    assert projects[0]["chat_count"] == 0

    deleted = await delete_project(project_id=project_id, db=db, user_email=USER)
    assert deleted["ok"] is True
    projects = await list_projects(db=db, user_email=USER, limit=50, offset=0)
    assert projects == []


@pytest.mark.asyncio
async def test_fork_chat_from_message_keeps_project_metadata(db):
    project = await create_project(
        ProjectCreate(name="Thesis", description="Main branch"),
        db=db,
        user_email=USER,
    )
    original_chat = await create_chat(
        CreateChatRequest(title="Original thread", project_id=project["id"]),
        db=db,
        user_email=USER,
    )

    db.add_all([
        ChatMessage(session_id=original_chat["id"], role="user", content="First prompt"),
        ChatMessage(session_id=original_chat["id"], role="assistant", content="First answer"),
        ChatMessage(session_id=original_chat["id"], role="user", content="Second prompt"),
    ])
    await db.commit()

    original_messages = await get_chat_messages(chat_id=original_chat["id"], db=db, user_email=USER)
    forked_chat = await fork_chat(
        chat_id=original_chat["id"],
        req=ForkChatRequest(message_id=original_messages[0]["id"]),
        db=db,
        user_email=USER,
    )

    assert forked_chat["parent_chat_id"] == original_chat["id"]
    assert forked_chat["forked_from_message_id"] == original_messages[0]["id"]
    assert forked_chat["project_id"] == project["id"]
    assert forked_chat["project_name"] == "Thesis"
    assert forked_chat["message_count"] == 1

    forked_messages = await get_chat_messages(chat_id=forked_chat["id"], db=db, user_email=USER)
    assert len(forked_messages) == 1
    assert forked_messages[0]["content"] == "First prompt"

    hits = await search_chats(query="Original", db=db, user_email=USER, limit=20, offset=0)
    assert any(item["project_name"] == "Thesis" for item in hits)
