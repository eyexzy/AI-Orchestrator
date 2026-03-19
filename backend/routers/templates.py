import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import PromptTemplateDB, _uuid
from dependencies import get_current_user, get_db
from schemas.api import (
    TemplateCreate,
    TemplateUpdate,
    ReorderItem,
)

router = APIRouter()


def _apply_template_payload(row: PromptTemplateDB, req: TemplateCreate) -> None:
    row.title = req.title
    row.description = req.description
    row.category_name = req.category_name
    row.category_color = req.category_color
    row.prompt = req.prompt
    row.system_message = req.system_message
    row.variables_json = json.dumps(req.variables)
    row.is_favorite = req.is_favorite
    row.order_index = req.order_index


def _row_to_response(row: PromptTemplateDB) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "category_name": row.category_name,
        "category_color": row.category_color,
        "prompt": row.prompt,
        "system_message": row.system_message,
        "variables": json.loads(row.variables_json) if row.variables_json else [],
        "is_favorite": row.is_favorite or False,
        "order_index": row.order_index,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def _get_owned_template(
    db: AsyncSession,
    template_id: str,
    user_email: str,
) -> PromptTemplateDB:
    result = await db.execute(
        select(PromptTemplateDB).where(
            PromptTemplateDB.id == template_id,
            PromptTemplateDB.user_email == user_email,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return row


# GET /templates

@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    result = await db.execute(
        select(PromptTemplateDB)
        .where(PromptTemplateDB.user_email == user_email)
        .order_by(PromptTemplateDB.order_index)
    )
    rows = result.scalars().all()
    return [_row_to_response(r) for r in rows]


# POST /templates

@router.post("/templates")
async def create_template(
    req: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    requested_id = req.id if getattr(req, "id", None) else _uuid()

    existing_result = await db.execute(
        select(PromptTemplateDB).where(
            PromptTemplateDB.id == requested_id,
            PromptTemplateDB.user_email == user_email,
        )
    )
    existing = existing_result.scalars().first()
    if existing:
        _apply_template_payload(existing, req)
        await db.commit()
        await db.refresh(existing)
        return _row_to_response(existing)

    row = PromptTemplateDB(
        id=requested_id,
        user_email=user_email,
    )
    _apply_template_payload(row, req)
    db.add(row)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()

        existing_result = await db.execute(
            select(PromptTemplateDB).where(
                PromptTemplateDB.id == requested_id,
                PromptTemplateDB.user_email == user_email,
            )
        )
        existing = existing_result.scalars().first()
        if existing:
            _apply_template_payload(existing, req)
            await db.commit()
            await db.refresh(existing)
            return _row_to_response(existing)

        raise HTTPException(
            status_code=409,
            detail="Template with this id already exists for this user",
        ) from exc

    await db.refresh(row)
    return _row_to_response(row)


# PUT /templates/reorder  (must be before /templates/{id} to avoid clash)

@router.put("/templates/reorder")
async def reorder_templates(
    items: list[ReorderItem],
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    if not items:
        return {"ok": True}
    id_to_order = {item.id: item.order_index for item in items}
    template_ids = list(id_to_order.keys())

    result = await db.execute(
        select(PromptTemplateDB.id).where(
            PromptTemplateDB.user_email == user_email,
            PromptTemplateDB.id.in_(template_ids),
        )
    )
    owned_ids = set(result.scalars().all())
    if owned_ids != set(template_ids):
        raise HTTPException(status_code=404, detail="One or more templates not found")

    stmt = (
        update(PromptTemplateDB)
        .where(
            PromptTemplateDB.user_email == user_email,
            PromptTemplateDB.id.in_(template_ids),
        )
        .values(
            order_index=case(
                id_to_order,
                value=PromptTemplateDB.id,
            )
        )
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}


# PUT /templates/{template_id}

@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    req: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    row = await _get_owned_template(db, template_id, user_email)

    update_data = req.model_dump(exclude_none=True)
    if "variables" in update_data:
        update_data["variables_json"] = json.dumps(update_data.pop("variables"))

    for key, value in update_data.items():
        setattr(row, key, value)

    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


# DELETE /templates/{template_id}

@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    row = await _get_owned_template(db, template_id, user_email)
    await db.delete(row)
    await db.commit()
    return {"ok": True}