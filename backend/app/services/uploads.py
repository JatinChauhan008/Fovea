"""
The checks an upload must pass, and where its files go. Each check raises
UploadRejected with the HTTP status and a message fit to show the reader; the upload
flow turns that into the response and removes anything already written.

- check_pdf_filename: the name must end in .pdf.
- new_document_paths: fresh, unguessable file names in the reader's own folder.
- store_upload: copy the upload to disk, refusing it past the size limit.
- check_real_pdf: the stored file must start like a PDF.
- check_storage_room: the reader's folder must be within their storage limit.
"""

import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import status

from app.config import MB
from app.services.storage import UploadTooLarge, save_upload, starts_like_pdf, storage_used_bytes


class UploadRejected(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def check_pdf_filename(filename: str) -> None:
    if not filename.lower().endswith(".pdf"):
        raise UploadRejected(status.HTTP_400_BAD_REQUEST, "Only PDF files are supported")


def new_document_paths(user_dir: Path) -> tuple[Path, Path]:
    user_dir.mkdir(parents=True, exist_ok=True)
    handle = uuid.uuid4().hex
    return user_dir / f"{handle}.pdf", user_dir / f"{handle}.tokens.json"


def store_upload(source: BinaryIO, destination: Path, max_upload_mb: float) -> None:
    try:
        save_upload(source, destination, max_bytes=int(max_upload_mb * MB))
    except UploadTooLarge as exc:
        raise UploadRejected(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"That file is too big. The limit is {max_upload_mb:g} MB.",
        ) from exc


def check_real_pdf(path: Path) -> None:
    if not starts_like_pdf(path):
        raise UploadRejected(status.HTTP_400_BAD_REQUEST, "That file is not a valid PDF")


def check_storage_room(user_dir: Path, max_storage_mb: float) -> None:
    if storage_used_bytes(user_dir) > max_storage_mb * MB:
        raise UploadRejected(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "You've used all your storage space. Delete a document to add another.",
        )
