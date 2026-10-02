"""
Database reads for the Stats page, each scoped to one reader and done as aggregates
in SQL rather than by loading every session.

- reading_totals: words, seconds, word-weighted average speed and fastest speed
  (stretches under MIN_WORDS_FOR_BEST words don't count for fastest).
- count_documents / count_finished_documents: the reader's documents, and those read
  at least COMPLETION_THRESHOLD of the way through.
- recent_sessions: just the columns the chart and streak need, since a cutoff.

All filter on user id first; reading_sessions, progress and documents are indexed on it.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Document, Progress, ReadingSession
from app.services.analytics import COMPLETION_THRESHOLD, MIN_WORDS_FOR_BEST, SessionRow


@dataclass(frozen=True)
class ReadingTotals:
    words_read: int
    seconds: float
    average_wpm: float
    best_wpm: int


def reading_totals(db: Session, user_id: int) -> ReadingTotals:
    mine = ReadingSession.user_id == user_id
    words, seconds, weighted = db.execute(
        select(
            func.coalesce(func.sum(ReadingSession.words_read), 0),
            func.coalesce(func.sum(ReadingSession.duration_seconds), 0.0),
            func.coalesce(func.sum(ReadingSession.wpm * ReadingSession.words_read), 0),
        ).where(mine)
    ).one()
    best = db.scalar(
        select(func.max(ReadingSession.wpm)).where(
            mine, ReadingSession.words_read >= MIN_WORDS_FOR_BEST
        )
    )
    return ReadingTotals(
        words_read=int(words),
        seconds=float(seconds),
        average_wpm=weighted / words if words else 0.0,
        best_wpm=int(best or 0),
    )


def count_documents(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count(Document.id)).where(Document.user_id == user_id)) or 0


def count_finished_documents(db: Session, user_id: int) -> int:
    finished = (
        select(func.count(Progress.id))
        .join(Document, Document.id == Progress.document_id)
        .where(
            Progress.user_id == user_id,
            Document.word_count > 0,
            Progress.word_index >= Document.word_count * COMPLETION_THRESHOLD,
        )
    )
    return db.scalar(finished) or 0


def recent_sessions(db: Session, user_id: int, since: datetime) -> list[SessionRow]:
    rows = db.execute(
        select(ReadingSession.created_at, ReadingSession.words_read, ReadingSession.wpm)
        .where(ReadingSession.user_id == user_id, ReadingSession.created_at >= since)
        .order_by(ReadingSession.created_at)
    )
    return [SessionRow(*row) for row in rows]
