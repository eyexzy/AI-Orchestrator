import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import ChatSession, Project, ProjectSource, UploadedFile
from dependencies import get_current_user, get_db
from schemas.api import ProjectCreate, ProjectResponse, ProjectUpdate, ProjectSourceResponse, AddTextSourceRequest
from services.files import process_upload, save_file_bytes, read_file_bytes, delete_file

router = APIRouter()

def _project_to_response(project: Project, *, chat_count: int = 0, source_count: int = 0) -> dict:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description or "",
        accent_color=project.accent_color or "blue",
        icon_name=project.icon_name or "folder",
        starter_prompt=project.starter_prompt or "",
        system_hint=project.system_hint or "",
        is_favorite=project.is_favorite or False,
        chat_count=chat_count,
        source_count=source_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
    ).model_dump()


def _source_to_response(source: ProjectSource, file: UploadedFile) -> dict:
    thumbnail_data: str | None = None
    if file.mime_type.startswith("image/") and file.storage_path:
        try:
            import base64
            raw = read_file_bytes(file.storage_path)
            thumbnail_data = f"data:{file.mime_type};base64,{base64.b64encode(raw).decode()}"
        except Exception:
            pass

    return ProjectSourceResponse(
        id=source.id,
        project_id=source.project_id,
        file_id=source.file_id,
        title=source.title or file.filename,
        filename=file.filename,
        mime_type=file.mime_type,
        size_bytes=file.size_bytes,
        created_at=source.created_at,
        thumbnail_data=thumbnail_data,
    ).model_dump()


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


@router.get("/projects")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(
            Project,
            func.count(ChatSession.id.distinct()).label("chat_count"),
            func.count(ProjectSource.id.distinct()).label("source_count"),
        )
        .outerjoin(ChatSession, Project.id == ChatSession.project_id)
        .outerjoin(ProjectSource, Project.id == ProjectSource.project_id)
        .where(Project.user_email == user_email)
        .group_by(Project.id)
        .order_by(
            Project.is_favorite.desc(),
            Project.updated_at.desc(),
            Project.created_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).all()
    return [
        _project_to_response(project, chat_count=chat_count, source_count=source_count)
        for project, chat_count, source_count in rows
    ]


@router.post("/projects")
async def create_project(
    req: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    project = Project(
        user_email=user_email,
        name=req.name.strip(),
        description=req.description.strip(),
        accent_color=req.accent_color,
        icon_name=req.icon_name,
        starter_prompt=req.starter_prompt.strip(),
        system_hint=req.system_hint.strip(),
        is_favorite=req.is_favorite,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _project_to_response(project, chat_count=0)


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    project = await _get_owned_project(db, project_id, user_email)
    chat_count = (
        await db.execute(
            select(func.count(ChatSession.id)).where(ChatSession.project_id == project.id)
        )
    ).scalar_one()
    source_count = (
        await db.execute(
            select(func.count(ProjectSource.id)).where(ProjectSource.project_id == project.id)
        )
    ).scalar_one()
    return _project_to_response(project, chat_count=chat_count, source_count=source_count)


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    req: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    project = await _get_owned_project(db, project_id, user_email)
    updates = req.model_dump(exclude_unset=True)

    if "name" in updates and req.name is not None:
        project.name = req.name.strip()
    if "description" in updates and req.description is not None:
        project.description = req.description.strip()
    if "accent_color" in updates and req.accent_color is not None:
        project.accent_color = req.accent_color
    if "icon_name" in updates and req.icon_name is not None:
        project.icon_name = req.icon_name
    if "starter_prompt" in updates and req.starter_prompt is not None:
        project.starter_prompt = req.starter_prompt.strip()
    if "system_hint" in updates and req.system_hint is not None:
        project.system_hint = req.system_hint.strip()
    if "is_favorite" in updates and req.is_favorite is not None:
        project.is_favorite = req.is_favorite

    await db.commit()
    await db.refresh(project)

    chat_count = (
        await db.execute(
            select(func.count(ChatSession.id)).where(ChatSession.project_id == project.id)
        )
    ).scalar_one()
    return _project_to_response(project, chat_count=chat_count)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    project = await _get_owned_project(db, project_id, user_email)

    await db.execute(
        update(ChatSession)
        .where(
            ChatSession.project_id == project.id,
            ChatSession.user_email == user_email,
        )
        .values(project_id=None)
    )
    await db.delete(project)
    await db.commit()
    return {"ok": True}


# ── Project Sources ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/sources")
async def list_project_sources(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user_email)
    result = await db.execute(
        select(ProjectSource, UploadedFile)
        .join(UploadedFile, ProjectSource.file_id == UploadedFile.id)
        .where(ProjectSource.project_id == project_id)
        .order_by(ProjectSource.created_at.desc())
    )
    return [_source_to_response(src, f) for src, f in result.all()]


@router.post("/projects/{project_id}/sources/upload")
async def upload_project_source(
    project_id: str,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user_email)
    data = await file.read()
    mime = file.content_type or "application/octet-stream"
    storage_path, extracted_text = process_upload(data, file.filename or "file", mime)

    uploaded = UploadedFile(
        user_email=user_email,
        filename=file.filename or "file",
        mime_type=mime,
        size_bytes=len(data),
        storage_path=storage_path,
        extracted_text=extracted_text,
    )
    db.add(uploaded)
    await db.flush()

    source = ProjectSource(
        project_id=project_id,
        file_id=uploaded.id,
        title=uploaded.filename,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _source_to_response(source, uploaded)


@router.post("/projects/{project_id}/sources/text")
async def add_text_source(
    project_id: str,
    req: AddTextSourceRequest,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user_email)
    filename = f"{req.title}.txt"
    content_bytes = req.content.encode("utf-8")
    storage_path = save_file_bytes(content_bytes, filename)

    uploaded = UploadedFile(
        user_email=user_email,
        filename=filename,
        mime_type="text/plain",
        size_bytes=len(content_bytes),
        storage_path=storage_path,
        extracted_text=req.content[:50000],
    )
    db.add(uploaded)
    await db.flush()

    source = ProjectSource(
        project_id=project_id,
        file_id=uploaded.id,
        title=req.title,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _source_to_response(source, uploaded)


@router.delete("/projects/{project_id}/sources/{source_id}")
async def delete_project_source(
    project_id: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user_email)
    result = await db.execute(
        select(ProjectSource).where(
            ProjectSource.id == source_id,
            ProjectSource.project_id == project_id,
        )
    )
    source = result.scalars().first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # Load file record to delete from storage
    file_result = await db.execute(
        select(UploadedFile).where(UploadedFile.id == source.file_id)
    )
    uploaded_file = file_result.scalars().first()

    await db.delete(source)
    await db.commit()

    # Delete from storage after DB commit (non-critical if fails)
    if uploaded_file and uploaded_file.storage_path:
        delete_file(uploaded_file.storage_path)

    return {"ok": True}
