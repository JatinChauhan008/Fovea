"""
Database reads and writes for where each reader is in each document.

- find_progress: one reader's place in one document, or None if they haven't started.
- progress_by_document: all of a reader's places, keyed by document id, for the library.
- save_progress: create or update a reader's place, and remember the speed they were
  reading at as their preferred speed for next time. Commits.

Places are unique per (user, document); lookups use that unique index.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Progress, User


def find_progress(db: Session, user_id: int, document_id: int) -> Progress | None:
    return db.scalar(
        select(Progress).where(Progress.user_id == user_id, Progress.document_id == document_id)
    )


def progress_by_document(db: Session, user_id: int) -> dict[int, Progress]:
    rows = db.scalars(select(Progress).where(Progress.user_id == user_id))
    return {row.document_id: row for row in rows}


def save_progress(
    db: Session, user: User, document_id: int, *, word_index: int, page: int, wpm: int
) -> Progress:
    progress = find_progress(db, user.id, document_id)
    if progress is None:
        progress = Progress(user_id=user.id, document_id=document_id)
        db.add(progress)
    progress.word_index = word_index
    progress.page = page
    progress.wpm = wpm
    user.preferred_wpm = wpm
    db.commit()
    db.refresh(progress)
    return progress
