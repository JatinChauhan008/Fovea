from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Progress, ReadingSession, User
from app.routers.documents import get_owned_document, progress_out
from app.schemas import ProgressIn, ProgressOut, Recommendation, SessionIn, SessionOut
from app.security import get_current_user
from app.services.adaptive import Sample, recommend

router = APIRouter(tags=["progress"])
settings = get_settings()


@router.post("/progress", response_model=ProgressOut)
def save_progress(
    payload: ProgressIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressOut:
    document = get_owned_document(payload.document_id, user, db)

    word_index = min(payload.word_index, max(document.word_count - 1, 0))
    progress = db.scalar(
        select(Progress).where(Progress.user_id == user.id, Progress.document_id == document.id)
    )

    if progress is None:
        progress = Progress(user_id=user.id, document_id=document.id)
        db.add(progress)

    progress.word_index = word_index
    progress.page = min(max(payload.page, 1), max(document.page_count, 1))
    progress.wpm = payload.wpm

    # The most recent speed a reader chose is the one to resume them at next time.
    user.preferred_wpm = payload.wpm

    db.commit()
    db.refresh(progress)

    result = progress_out(progress, document.word_count)
    assert result is not None
    return result


@router.get("/progress/{document_id}", response_model=ProgressOut)
def get_progress(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressOut:
    document = get_owned_document(document_id, user, db)
    progress = db.scalar(
        select(Progress).where(Progress.user_id == user.id, Progress.document_id == document.id)
    )
    if progress is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No saved progress for this document")

    result = progress_out(progress, document.word_count)
    assert result is not None
    return result


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def record_session(
    payload: SessionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    """Log a stretch of reading. This is the raw signal behind analytics and adaptation."""
    document = get_owned_document(payload.document_id, user, db)
    words_read = max(payload.end_index - payload.start_index, 0)

    session = ReadingSession(
        user_id=user.id,
        document_id=document.id,
        start_index=payload.start_index,
        end_index=payload.end_index,
        words_read=words_read,
        wpm=payload.wpm,
        duration_seconds=payload.duration_seconds,
        comprehension=payload.comprehension,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return SessionOut.model_validate(session)


@router.get("/adaptive/recommendation", response_model=Recommendation)
def get_recommendation(
    document_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Recommendation:
    """Recommend a reading speed from this reader's scored sessions."""
    query = (
        select(ReadingSession)
        .where(ReadingSession.user_id == user.id, ReadingSession.comprehension.is_not(None))
        .order_by(ReadingSession.created_at.asc())
    )
    if document_id is not None:
        get_owned_document(document_id, user, db)
        query = query.where(ReadingSession.document_id == document_id)

    samples = [Sample(wpm=s.wpm, comprehension=s.comprehension or 0.0) for s in db.scalars(query)]

    result = recommend(
        samples,
        current_wpm=user.preferred_wpm,
        min_wpm=settings.min_wpm,
        max_wpm=settings.max_wpm,
        default_wpm=settings.default_wpm,
    )
    return Recommendation(**result)
