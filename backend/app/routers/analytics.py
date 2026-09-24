from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Document, Progress, ReadingSession, User
from app.schemas import AnalyticsSummary, SpeedPoint
from app.security import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])

# A document counts as finished once the reader is this far through it.
COMPLETION_THRESHOLD = 0.95


def _streak(days: set[date]) -> int:
    """Consecutive days of reading, counting back from today (or yesterday)."""
    if not days:
        return 0

    today = date.today()
    cursor = today if today in days else today - timedelta(days=1)
    if cursor not in days:
        return 0

    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


@router.get("/summary", response_model=AnalyticsSummary)
def summary(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AnalyticsSummary:
    sessions = list(
        db.scalars(
            select(ReadingSession)
            .where(ReadingSession.user_id == user.id)
            .order_by(ReadingSession.created_at.asc())
        )
    )

    documents_total = (
        db.scalar(select(func.count(Document.id)).where(Document.user_id == user.id)) or 0
    )

    completed = 0
    progress_rows = db.scalars(select(Progress).where(Progress.user_id == user.id))
    for row in progress_rows:
        document = db.get(Document, row.document_id)
        if document and document.word_count:
            if row.word_index / document.word_count >= COMPLETION_THRESHOLD:
                completed += 1

    words_read = sum(s.words_read for s in sessions)
    seconds = sum(s.duration_seconds for s in sessions)

    # Weight speed by words actually read, so a 30-second burst does not
    # outweigh a twenty-minute session.
    if words_read:
        average_wpm = sum(s.wpm * s.words_read for s in sessions) / words_read
    else:
        average_wpm = 0.0

    # Daily trend, one point per day the reader was active.
    per_day: dict[date, list[ReadingSession]] = defaultdict(list)
    for session in sessions:
        per_day[session.created_at.date()].append(session)

    trend: list[SpeedPoint] = []
    for day in sorted(per_day)[-30:]:
        rows = per_day[day]
        day_words = sum(r.words_read for r in rows)
        day_wpm = (
            sum(r.wpm * r.words_read for r in rows) / day_words
            if day_words
            else sum(r.wpm for r in rows) / len(rows)
        )
        trend.append(
            SpeedPoint(
                date=day.isoformat(),
                wpm=round(day_wpm, 1),
                words=day_words,
            )
        )

    return AnalyticsSummary(
        documents_total=documents_total,
        documents_completed=completed,
        words_read=words_read,
        minutes_read=round(seconds / 60, 1),
        average_wpm=round(average_wpm, 1),
        best_wpm=float(max((s.wpm for s in sessions), default=0)),
        current_streak_days=_streak({s.created_at.date() for s in sessions}),
        trend=trend,
    )
