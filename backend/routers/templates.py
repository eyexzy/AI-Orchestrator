import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, update, case
from sqlalchemy.ext.asyncio import AsyncSession

from database import PromptTemplateDB, _uuid
from dependencies import check_admin_key, get_db
from schemas.api import (
    TemplateCreate,
    TemplateUpdate,
    TemplateResponse,
    ReorderItem,
)

router = APIRouter()


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


# GET /templates

@router.get("/templates")
async def list_templates(
    user_email: str = "anonymous",
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
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
    user_email: str = "anonymous",
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
):
    row = PromptTemplateDB(
        id=req.id if getattr(req, "id", None) else _uuid(),
        user_email=user_email,
        title=req.title,
        description=req.description,
        category_name=req.category_name,
        category_color=req.category_color,
        prompt=req.prompt,
        system_message=req.system_message,
        variables_json=json.dumps(req.variables),
        is_favorite=req.is_favorite,
        order_index=req.order_index,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


# PUT /templates/reorder  (must be before /templates/{id} to avoid clash)

@router.put("/templates/reorder")
async def reorder_templates(
    items: list[ReorderItem],
    db: AsyncSession = Depends(get_db),
    _api_key: str = Depends(check_admin_key),
):
    if not items:
        return {"ok": True}
    id_to_order = {item.id: item.order_index for item in items}
    stmt = (
        update(PromptTemplateDB)
        .where(PromptTemplateDB.id.in_(id_to_order.keys()))
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
    _api_key: str = Depends(check_admin_key),
):
    result = await db.execute(
        select(PromptTemplateDB).where(PromptTemplateDB.id == template_id)
    )
    row = result.scalars().first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Template not found"})

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
    _api_key: str = Depends(check_admin_key),
):
    result = await db.execute(
        select(PromptTemplateDB).where(PromptTemplateDB.id == template_id)
    )
    row = result.scalars().first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Template not found"})
    await db.delete(row)
    await db.commit()
    return {"ok": True}