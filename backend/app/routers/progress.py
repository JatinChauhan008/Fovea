"""
Reading flows: saving the reader's place in a document, and logging a stretch of
reading for the Stats page. Both refuse documents the reader doesn't own (404).

Docs: ./architecture.md
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.permissions import get_owned_document
from app.queries.progress import save_progress
from app.queries.sessions import add_reading_session
from app.schemas import ProgressIn, ProgressOut, SessionIn, SessionOut
from app.security import get_current_user
from app.services.reading import clamp_position, progress_out, words_in_stretch

router = APIRouter(tags=["progress"])


@router.post("/progress", response_model=ProgressOut)
def save_place(
    payload: ProgressIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressOut | None:
    """Remember where the reader is, and the speed they're reading at."""
    # Load the document, refusing anyone but its owner.
    document = get_owned_document(db, payload.document_id, user)

    # Keep the word and page inside the document.
    word_index, page = clamp_position(payload.word_index, payload.page, document)

    # Save the place, and the speed as their preferred speed for next time.
    progress = save_progress(
        db, user, document.id, word_index=word_index, page=page, wpm=payload.wpm
    )

    return progress_out(progress, document.word_count)


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def log_reading(
    payload: SessionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    """Log one continuous stretch of reading: the raw signal behind the Stats page."""
    # Load the document, refusing anyone but its owner.
    document = get_owned_document(db, payload.document_id, user)

    # Count only words inside the document, never a negative stretch.
    words_read = words_in_stretch(payload.start_index, payload.end_index, document.word_count)

    # Save the stretch.
    session = add_reading_session(
        db,
        user_id=user.id,
        document_id=document.id,
        start_index=payload.start_index,
        end_index=payload.end_index,
        words_read=words_read,
        wpm=payload.wpm,
        duration_seconds=payload.duration_seconds,
    )

    return SessionOut.model_validate(session)
