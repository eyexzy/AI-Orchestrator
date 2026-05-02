import pytest

from services.files import FileValidationError, validate_file


def test_validate_file_allows_safe_text_upload():
    validate_file("notes.md", "text/markdown", 1024)


def test_validate_file_rejects_unknown_extension():
    with pytest.raises(FileValidationError):
        validate_file("payload.exe", "application/octet-stream", 1024)


def test_validate_file_rejects_disallowed_mime_for_allowed_extension():
    with pytest.raises(FileValidationError):
        validate_file("notes.txt", "application/x-msdownload", 1024)


def test_validate_file_rejects_oversized_upload():
    with pytest.raises(FileValidationError):
        validate_file("big.pdf", "application/pdf", 30 * 1024 * 1024)
