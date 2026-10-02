"""
Document flows: uploading a PDF, listing the library, opening one document, streaming
its words, and deleting it. Every route acts only on the signed-in reader's documents;
someone else's document answers 404.

Docs: ./architecture.md
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.permissions import get_owned_document
from app.queries.documents import create_document, delete_document, list_documents
from app.queries.progress import find_progress, progress_by_document
from app.schemas import ContentOut, DocumentOut, DocumentWithProgress
from app.security import get_current_user
from app.services.extraction import extract_pdf
from app.services.pdf_service import PdfExtractionError, guess_title, read_tokens
from app.services.reading import document_with_progress
from app.services.storage import remove_files
from app.services.uploads import (
    UploadRejected,
    check_pdf_filename,
    check_real_pdf,
    check_storage_room,
    new_document_paths,
    store_upload,
)

router = APIRouter(tags=["documents"])
settings = get_settings()
logger = logging.getLogger(__name__)


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentOut:
    """
    Add a PDF to the reader's library. A plain function, so FastAPI runs it on a worker
    thread and the copy, extraction and database work never block other requests.

    1. Check the name, then copy the upload into the reader's folder.
    2. Check it really is a PDF and that the reader has room for it.
    3. Pull the words out in a child process and save them next to the PDF.
    4. Only then create the document, so a failure leaves nothing behind.
    """
    filename = file.filename or "document.pdf"
    user_dir = settings.storage_dir / str(user.id)
    pdf_path, tokens_path = new_document_paths(user_dir)

    try:
        # Refuse anything not named like a PDF before writing a byte.
        check_pdf_filename(filename)

        # Copy the upload to disk in chunks, stopping at the size limit.
        store_upload(file.file, pdf_path, settings.max_upload_mb)

        # A renamed file of another kind is refused here.
        check_real_pdf(pdf_path)

        # The reader's PDFs and extracted text must fit in their storage limit.
        check_storage_room(user_dir, settings.max_storage_mb)

        # Extract and tokenize the text in a child process, with a time limit.
        extracted = extract_pdf(pdf_path, tokens_path, settings.pdf_timeout_seconds)

        # Save the finished document to the reader's library.
        document = create_document(
            db,
            user_id=user.id,
            title=guess_title(extracted.title, filename),
            original_filename=filename,
            stored_path=str(pdf_path),
            tokens_path=str(tokens_path),
            page_count=extracted.page_count,
            word_count=extracted.word_count,
        )
    except (UploadRejected, PdfExtractionError) as exc:
        # A refusal the reader should see: remove what was written and say why.
        remove_files(pdf_path, tokens_path)
        code = (
            exc.status_code
            if isinstance(exc, UploadRejected)
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        logger.info("upload rejected", extra={"user_id": user.id, "status": code})
        raise HTTPException(code, str(exc)) from exc
    except Exception:
        # Anything unexpected: still remove what was written, then let it surface as a 500.
        remove_files(pdf_path, tokens_path)
        raise

    logger.info(
        "document uploaded",
        extra={
            "user_id": user.id,
            "document_id": document.id,
            "pages": document.page_count,
            "words": document.word_count,
        },
    )
    return DocumentOut.model_validate(document)


@router.get("/documents", response_model=list[DocumentWithProgress])
def library(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[DocumentWithProgress]:
    """The reader's documents, newest first, each with how far through it they are."""
    # Their documents, and their place in each, in two queries.
    documents = list_documents(db, user.id)
    places = progress_by_document(db, user.id)

    # Pair each document with the reader's place in it.
    return [document_with_progress(doc, places.get(doc.id)) for doc in documents]


@router.get("/documents/{document_id}", response_model=DocumentWithProgress)
def open_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentWithProgress:
    """One document and the reader's place in it."""
    # Load the document, refusing anyone but its owner.
    document = get_owned_document(db, document_id, user)

    # Where they left off, if they've started it.
    place = find_progress(db, user.id, document.id)

    return document_with_progress(document, place)


@router.get("/documents/{document_id}/content", response_model=ContentOut)
def stream_words(
    document_id: int,
    start: int = Query(0, ge=0),
    limit: int = Query(5000, ge=1, le=50000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContentOut:
    """A window of the document's words, so the reader can stream a long book in chunks."""
    # Load the document, refusing anyone but its owner.
    document = get_owned_document(db, document_id, user)

    # Its parsed words (cached, so streaming a book parses it once).
    try:
        words = read_tokens(Path(document.tokens_path))
    except FileNotFoundError as exc:
        logger.error("word file missing", extra={"document_id": document.id})
        raise HTTPException(
            status.HTTP_410_GONE, "The processed text for this document is missing"
        ) from exc

    window = words[start : start + limit]
    return ContentOut(
        document_id=document.id,
        start=start,
        count=len(window),
        total=len(words),
        page_count=document.page_count,
        tokens=window,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a document with its place, reading history and files."""
    # Load the document, refusing anyone but its owner.
    document = get_owned_document(db, document_id, user)
    files = (document.stored_path, document.tokens_path)

    # Remove it from the database first, so a failure here leaves it fully readable.
    delete_document(db, document)

    # Then remove its PDF and word file from disk.
    remove_files(*files)
