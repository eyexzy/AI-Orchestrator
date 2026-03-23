import pytest
from fastapi import HTTPException

from routers.templates import create_template, delete_template, list_templates, reorder_templates, update_template
from schemas.api import ReorderItem, TemplateCreate, TemplateUpdate

USER = "template@test.dev"
OTHER = "other@test.dev"


@pytest.mark.asyncio
async def test_template_flow(db):
    first = await create_template(
        TemplateCreate(
            id="tpl-a",
            title="One",
            description="A",
            category_name="Work",
            category_color="blue",
            prompt="Prompt one",
            system_message="System one",
            variables=["topic"],
            is_favorite=False,
            order_index=0,
        ),
        db=db,
        user_email=USER,
    )
    second = await create_template(
        TemplateCreate(
            id="tpl-b",
            title="Two",
            description="B",
            category_name="Study",
            category_color="green",
            prompt="Prompt two",
            system_message="System two",
            variables=["level"],
            is_favorite=True,
            order_index=1,
        ),
        db=db,
        user_email=USER,
    )
    rows = await list_templates(db=db, user_email=USER)
    assert [item["id"] for item in rows] == ["tpl-a", "tpl-b"]
    await reorder_templates(
        items=[ReorderItem(id="tpl-a", order_index=2), ReorderItem(id="tpl-b", order_index=1)],
        db=db,
        user_email=USER,
    )
    rows = await list_templates(db=db, user_email=USER)
    assert [item["id"] for item in rows] == ["tpl-b", "tpl-a"]
    updated = await update_template(
        template_id=first["id"],
        req=TemplateUpdate(title="One+", variables=["topic", "format"]),
        db=db,
        user_email=USER,
    )
    assert updated["title"] == "One+"
    assert updated["variables"] == ["topic", "format"]
    deleted = await delete_template(template_id=second["id"], db=db, user_email=USER)
    assert deleted["ok"] is True
    rows = await list_templates(db=db, user_email=USER)
    assert len(rows) == 1
    assert rows[0]["id"] == first["id"]


@pytest.mark.asyncio
async def test_template_is_user_scoped(db):
    created = await create_template(
        TemplateCreate(
            id="tpl-private",
            title="Private",
            description="",
            category_name="Secret",
            category_color="red",
            prompt="Hidden",
            system_message="",
            variables=[],
            is_favorite=False,
            order_index=0,
        ),
        db=db,
        user_email=USER,
    )
    with pytest.raises(HTTPException) as exc:
        await delete_template(template_id=created["id"], db=db, user_email=OTHER)
    assert exc.value.status_code == 404
