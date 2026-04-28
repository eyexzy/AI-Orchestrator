"""File upload service: validation, cloud storage (R2), text extraction."""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger("ai-orchestrator")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ALLOWED_MIME_TYPES: set[str] = set()
ALLOWED_EXTENSIONS: set[str] = set()

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_EXTRACTED_CHARS = 50_000
MAX_PROJECT_SOURCES_CHARS = 150_000

# ---------------------------------------------------------------------------
# Cloudflare R2 storage
# ---------------------------------------------------------------------------

R2_ACCOUNT_ID   = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY   = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY   = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET       = os.getenv("R2_BUCKET_NAME", "ai-orchestrator-uploads")
R2_PUBLIC_URL   = os.getenv("R2_PUBLIC_URL", "").rstrip("/")  # optional CDN URL

_r2_client = None

def _get_r2() :
    """Lazy-init boto3 S3 client pointed at Cloudflare R2."""
    global _r2_client
    if _r2_client is not None:
        return _r2_client
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY):
        return None
    try:
        import boto3
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto",
        )
        logger.info("[files] R2 client initialized (bucket=%s)", R2_BUCKET)
        return _r2_client
    except Exception as exc:
        logger.error("[files] R2 init failed: %s", exc)
        return None


def _r2_available() -> bool:
    return _get_r2() is not None


def _r2_put(key: str, data: bytes, mime_type: str = "application/octet-stream") -> None:
    r2 = _get_r2()
    if r2 is None:
        raise RuntimeError("R2 not configured")
    r2.put_object(Bucket=R2_BUCKET, Key=key, Body=data, ContentType=mime_type)


def _r2_get(key: str) -> bytes:
    r2 = _get_r2()
    if r2 is None:
        raise RuntimeError("R2 not configured")
    resp = r2.get_object(Bucket=R2_BUCKET, Key=key)
    return resp["Body"].read()


def _r2_delete(key: str) -> None:
    r2 = _get_r2()
    if r2 is None:
        return
    try:
        r2.delete_object(Bucket=R2_BUCKET, Key=key)
    except Exception as exc:
        logger.warning("[files] r2_delete_failed key=%s error=%s", key, exc)


def _is_local_path(storage_path: str) -> bool:
    """True for legacy local paths written before R2 migration."""
    return storage_path.startswith("./") or storage_path.startswith("/") or "\\" in storage_path


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class FileValidationError(ValueError):
    pass


def validate_file(filename: str, mime_type: str, size_bytes: int) -> None:
    if ALLOWED_EXTENSIONS:
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise FileValidationError(
                f"File type '{ext}' is not allowed. "
                f"Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )
    if ALLOWED_MIME_TYPES and mime_type not in ALLOWED_MIME_TYPES:
        raise FileValidationError(f"MIME type '{mime_type}' is not allowed.")
    if size_bytes > MAX_FILE_SIZE_BYTES:
        limit_mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise FileValidationError(
            f"File size {size_bytes / (1024*1024):.1f} MB exceeds the {limit_mb} MB limit."
        )


# ---------------------------------------------------------------------------
# Storage public API
# ---------------------------------------------------------------------------

def save_file_bytes(data: bytes, filename: str, mime_type: str = "application/octet-stream") -> str:
    """Upload to R2 and return the storage key."""
    if not _r2_available():
        raise RuntimeError("R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
    safe_name = f"{uuid.uuid4().hex}_{Path(filename).name}"
    key = f"uploads/{safe_name}"
    _r2_put(key, data, mime_type)
    logger.info("[files] r2_put key=%s bytes=%d", key, len(data))
    return key


def read_file_bytes(storage_path: str) -> bytes:
    """Read file bytes from R2 (or legacy local path for backward compat)."""
    if _is_local_path(storage_path):
        return Path(storage_path).read_bytes()
    return _r2_get(storage_path)


def delete_file(storage_path: str) -> None:
    """Delete file from R2 (or legacy local path for backward compat)."""
    if _is_local_path(storage_path):
        try:
            Path(storage_path).unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("[files] local_delete_failed path=%s error=%s", storage_path, exc)
    else:
        _r2_delete(storage_path)


def get_public_url(storage_path: str) -> str | None:
    """Return a public URL if R2_PUBLIC_URL is configured, else None."""
    if R2_PUBLIC_URL and not _is_local_path(storage_path):
        return f"{R2_PUBLIC_URL}/{storage_path}"
    return None


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

_TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".rst", ".csv", ".tsv",
    ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env",
    ".xml", ".html", ".htm", ".svg",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs",
    ".java", ".kt", ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".rb", ".php", ".swift", ".scala", ".sh", ".bash", ".zsh",
    ".sql", ".graphql", ".proto",
    ".css", ".scss", ".less",
    ".log", ".diff", ".patch",
    ".tex", ".bib",
}

_TEXT_MIMES = {
    "application/json", "application/xml", "application/yaml",
    "application/x-yaml", "application/toml", "application/javascript",
    "application/typescript", "application/graphql", "application/x-sh",
}


def _is_text_mime(mime_type: str) -> bool:
    return mime_type.startswith("text/") or mime_type in _TEXT_MIMES


def _extract_text(data: bytes, mime_type: str, filename: str) -> str:
    ext = Path(filename).suffix.lower()

    if _is_text_mime(mime_type) or ext in _TEXT_EXTENSIONS:
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return ""

    if mime_type == "application/pdf" or ext == ".pdf":
        return _extract_pdf(data)

    if mime_type.startswith("image/") or ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"):
        return _extract_image_ocr(data)

    if ext == ".docx" or "wordprocessingml" in mime_type:
        return _extract_docx(data)

    if ext in (".xlsx", ".xls") or "spreadsheetml" in mime_type or mime_type == "application/vnd.ms-excel":
        return _extract_xlsx(data)

    try:
        text = data.decode("utf-8", errors="strict")
        ratio = sum(1 for c in text if c.isprintable() or c in "\n\r\t") / max(len(text), 1)
        if ratio > 0.85:
            return text
    except UnicodeDecodeError:
        pass

    return ""


def _extract_pdf(data: bytes) -> str:
    try:
        import fitz  # type: ignore[import]
        doc = fitz.open(stream=data, filetype="pdf")
        parts = [page.get_text() for page in doc]
        doc.close()
        return "\n".join(parts)
    except ImportError:
        logger.info("[files] pymupdf not installed — PDF extraction skipped")
        return ""
    except Exception as exc:
        logger.warning("[files] pdf_extraction_failed error=%s", exc)
        return ""


def _extract_image_ocr(data: bytes) -> str:
    try:
        import pytesseract  # type: ignore[import]
        from PIL import Image  # type: ignore[import]
        import io
        img = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(img)
    except ImportError:
        logger.info("[files] pytesseract/PIL not installed — OCR skipped")
        return ""
    except Exception as exc:
        logger.warning("[files] ocr_failed error=%s", exc)
        return ""


def _extract_docx(data: bytes) -> str:
    try:
        import docx  # type: ignore[import]
        import io
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    except ImportError:
        logger.info("[files] python-docx not installed — .docx extraction skipped")
        return ""
    except Exception as exc:
        logger.warning("[files] docx_extraction_failed error=%s", exc)
        return ""


def _extract_xlsx(data: bytes) -> str:
    try:
        import openpyxl  # type: ignore[import]
        import io
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        parts: list[str] = []
        for sheet in wb.worksheets:
            parts.append(f"[Sheet: {sheet.title}]")
            for row in sheet.iter_rows(values_only=True):
                row_str = "\t".join("" if v is None else str(v) for v in row)
                if row_str.strip():
                    parts.append(row_str)
        wb.close()
        return "\n".join(parts)
    except ImportError:
        logger.info("[files] openpyxl not installed — .xlsx extraction skipped")
        return ""
    except Exception as exc:
        logger.warning("[files] xlsx_extraction_failed error=%s", exc)
        return ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process_upload(data: bytes, filename: str, mime_type: str) -> tuple[str, str]:
    """
    Validate, store (R2 or local), and extract text.
    Returns (storage_path_or_key, extracted_text).
    """
    validate_file(filename, mime_type, len(data))
    storage_path = save_file_bytes(data, filename, mime_type)
    extracted = _extract_text(data, mime_type, filename)
    return storage_path, extracted[:MAX_EXTRACTED_CHARS]


def build_attachment_context(extracted_texts: list[tuple[str, str]]) -> str:
    if not extracted_texts:
        return ""
    parts: list[str] = ["[Attached Files]"]
    for filename, text in extracted_texts:
        if text.strip():
            parts.append(f"--- {filename} ---\n{text.strip()}")
        else:
            parts.append(f"--- {filename} --- (no extractable text)")
    return "\n\n".join(parts)
