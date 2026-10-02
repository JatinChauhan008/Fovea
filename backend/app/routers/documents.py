import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import DOCUMENT_READY, Document, Progress, User
from app.schemas import ContentOut, DocumentOut, DocumentWithProgress, ProgressOut
from app.security import get_current_user
from app.services.pdf_service import (
    PdfExtractionError,
    guess_title,
    process_pdf,
    read_tokens,
    write_tokens,
)
from app.services.storage import remove_files

router = APIRouter(tags=["documents"])
settings = get_settings()


def get_owned_document(document_id: int, user: User, db: Session) -> Document:
    document = db.get(Document, document_id)
    if document is None or document.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return document


def progress_out(progress: Progress | None, word_count: int) -> ProgressOut | None:
    if progress is None:
        return None
    percent = (progress.word_index / word_count * 100) if word_count else 0.0
    return ProgressOut(
        document_id=progress.document_id,
        word_index=progress.word_index,
        page=progress.page,
        wpm=progress.wpm,
        updated_at=progress.updated_at,
        percent_complete=round(min(percent, 100.0), 2),
    )


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentOut:
    filename = file.filename or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only PDF files are supported")

    payload = await file.read()
    size_mb = len(payload) / (1024 * 1024)
    if size_mb > settings.max_upload_mb:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File is {size_mb:.1f} MB; the limit is {settings.max_upload_mb} MB",
        )
    if not payload.startswith(b"%PDF"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file is not a valid PDF")

    user_dir: Path = settings.storage_dir / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)

    handle = uuid.uuid4().hex
    pdf_path = user_dir / f"{handle}.pdf"
    tokens_path = user_dir / f"{handle}.tokens.json"
    pdf_path.write_bytes(payload)

    # The row is only created once the text is out, so a failed upload leaves no
    # half-made document in the library - and its files are removed too.
    try:
        tokens, info = await asyncio.to_thread(process_pdf, pdf_path)
        write_tokens(tokens, tokens_path)
        document = Document(
            user_id=user.id,
            title=guess_title(info["metadata"], filename),
            original_filename=filename,
            stored_path=str(pdf_path),
            tokens_path=str(tokens_path),
            page_count=info["page_count"],
            word_count=len(tokens),
            status=DOCUMENT_READY,
        )
        db.add(document)
        db.commit()
    except PdfExtractionError as exc:
        remove_files(pdf_path, tokens_path)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except Exception:
        remove_files(pdf_path, tokens_path)
        raise

    db.refresh(document)
    return DocumentOut.model_validate(document)


@router.get("/documents", response_model=list[DocumentWithProgress])
def list_documents(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[DocumentWithProgress]:
    documents = list(
        db.scalars(
            select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
        )
    )
    progress_rows = {
        p.document_id: p for p in db.scalars(select(Progress).where(Progress.user_id == user.id))
    }

    results = []
    for document in documents:
        item = DocumentWithProgress.model_validate(document)
        item.progress = progress_out(progress_rows.get(document.id), document.word_count)
        results.append(item)
    return results


@router.get("/documents/{document_id}", response_model=DocumentWithProgress)
def get_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentWithProgress:
    document = get_owned_document(document_id, user, db)
    progress = db.scalar(
        select(Progress).where(Progress.user_id == user.id, Progress.document_id == document.id)
    )
    item = DocumentWithProgress.model_validate(document)
    item.progress = progress_out(progress, document.word_count)
    return item


@router.get("/documents/{document_id}/content", response_model=ContentOut)
def get_content(
    document_id: int,
    start: int = Query(0, ge=0),
    limit: int = Query(5000, ge=1, le=50000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentOut:
    document = get_owned_document(document_id, user, db)

    try:
        tokens = read_tokens(Path(document.tokens_path))
    except FileNotFoundError as exc:
        raise HTTPException(
            status.HTTP_410_GONE, "The processed text for this document is missing"
        ) from exc

    window = tokens[start : start + limit]
    return ContentOut(
        document_id=document.id,
        start=start,
        count=len(window),
        total=len(tokens),
        page_count=document.page_count,
        tokens=window,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    document = get_owned_document(document_id, user, db)

    remove_files(document.stored_path, document.tokens_path)

    db.delete(document)
    db.commit()
