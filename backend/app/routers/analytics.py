"""
Stats page flow: GET /analytics/summary.

1. Add up the reader's words, time and speeds in the database.
2. Count their documents, and the ones they've finished.
3. Load the last year of sessions and work out the streak and daily chart in the
   reader's own time zone.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.queries.analytics import (
    count_documents,
    count_finished_documents,
    reading_totals,
    recent_sessions,
)
from app.schemas import AnalyticsSummary
from app.security import get_current_user
from app.services.analytics import daily_trend, history_cutoff, local_day, reading_streak

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Real offsets run from UTC-12 to UTC+14.
_MAX_OFFSET_MINUTES = 14 * 60


@router.get("/summary", response_model=AnalyticsSummary)
def summary(
    utc_offset_minutes: int = Query(0, ge=-_MAX_OFFSET_MINUTES, le=_MAX_OFFSET_MINUTES),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsSummary:
    now = datetime.now(UTC)

    # Totals across everything they've read, added up by the database.
    totals = reading_totals(db, user.id)

    # How many documents they have, and how many they've read to the end.
    documents_total = count_documents(db, user.id)
    documents_completed = count_finished_documents(db, user.id)

    # Only the last year of sessions is needed for the streak and the chart.
    sessions = recent_sessions(db, user.id, since=history_cutoff(now))

    # Which of the reader's own days had reading in them, and today's date for them.
    days_read = {local_day(row.created_at, utc_offset_minutes) for row in sessions}
    today = local_day(now, utc_offset_minutes)

    # Consecutive days read up to today, and one speed point per recent day.
    streak = reading_streak(days_read, today)
    trend = daily_trend(sessions, utc_offset_minutes)

    return AnalyticsSummary(
        documents_total=documents_total,
        documents_completed=documents_completed,
        words_read=totals.words_read,
        minutes_read=round(totals.seconds / 60, 1),
        average_wpm=round(totals.average_wpm, 1),
        best_wpm=float(totals.best_wpm),
        current_streak_days=streak,
        trend=trend,
    )
