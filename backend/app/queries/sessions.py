"""Saves one logged stretch of reading (the raw material for the Stats page). Commits."""

from sqlalchemy.orm import Session

from app.models import ReadingSession


def add_reading_session(
    db: Session,
    *,
    user_id: int,
    document_id: int,
    start_index: int,
    end_index: int,
    words_read: int,
    wpm: int,
    duration_seconds: float,
) -> ReadingSession:
    session = ReadingSession(
        user_id=user_id,
        document_id=document_id,
        start_index=start_index,
        end_index=end_index,
        words_read=words_read,
        wpm=wpm,
        duration_seconds=duration_seconds,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
