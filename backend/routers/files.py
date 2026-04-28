"""File upload router — MVP attachment support."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, UploadedFile
from dependencies import RATE_LIMIT_GENERATE, get_current_user, get_db, limiter
from schemas.api import UploadedFileResponse
from services.files import FileValidationError, process_upload

logger = logging.getLogger("ai-orchestrator")

router = APIRouter(prefix="/files", tags=["files"])

# 5 uploads per minute per user — generous for a composer
RATE_LIMIT_UPLOAD = "5/minute"


@limiter.limit(RATE_LIMIT_UPLOAD)
@router.post("/upload", response_model=UploadedFileResponse)
async def upload_file(
    request: Request,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user_email: str = Depends(get_current_user),
):
    data = await file.read()
    filename = file.filename or "upload"
    mime_type = file.content_type or "application/octet-stream"

    try:
        storage_path, extracted_text = process_upload(data, filename, mime_type)
    except FileValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[files] upload_failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="File processing failed") from exc

    record = UploadedFile(
        user_email=user_email,
        filename=filename,
        mime_type=mime_type,
        size_bytes=len(data),
        storage_path=storage_path,
        extracted_text=extracted_text,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    logger.info(
        "[files] uploaded",
        extra={
            "file_id": record.id,
            "file_name": filename,
            "mime_type": mime_type,
            "size_bytes": len(data),
            "extracted_chars": len(extracted_text),
        },
    )

    return UploadedFileResponse(
        id=record.id,
        filename=record.filename,
        mime_type=record.mime_type,
        size_bytes=record.size_bytes,
        extracted_text=record.extracted_text,
        created_at=record.created_at,
    )
