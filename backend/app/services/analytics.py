"""
The arithmetic behind the Stats page, kept free of the database so it can be tested
directly: which local day a session belongs to, the current reading streak, and the
daily speed trend. Sessions are stored in UTC; `utc_offset_minutes` is the reader's
offset (330 for India), so days follow the reader's clock rather than the server's.
"""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import NamedTuple

from app.schemas import SpeedPoint

# A document counts as finished once the reader is this far through it.
COMPLETION_THRESHOLD = 0.95
# Stretches shorter than this don't count towards "fastest": a second at 900 wpm
# after nudging the speed up isn't a reading speed.
MIN_WORDS_FOR_BEST = 50
# The chart shows this many of the most recent days with any reading.
TREND_DAYS = 30
# Sessions older than this are not loaded for the chart and streak, so a streak
# can show at most this many days.
HISTORY_DAYS = 366


class SessionRow(NamedTuple):
    created_at: datetime
    words_read: int
    wpm: int


def history_cutoff(now: datetime) -> datetime:
    """The oldest session time worth loading, as naive UTC (the way sessions are stored)."""
    return (now - timedelta(days=HISTORY_DAYS)).astimezone(UTC).replace(tzinfo=None)


def local_day(moment: datetime, utc_offset_minutes: int) -> date:
    """The reader's calendar day for a UTC moment (naive datetimes are taken as UTC)."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return (moment + timedelta(minutes=utc_offset_minutes)).date()


def reading_streak(days: set[date], today: date) -> int:
    """Consecutive reading days ending today, or ending yesterday if nothing was read today yet."""
    cursor = today if today in days else today - timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


def daily_trend(rows: list[SessionRow], utc_offset_minutes: int) -> list[SpeedPoint]:
    """
    One point per local day with reading, oldest first, for the last TREND_DAYS such
    days. Each day's speed is weighted by words read, so a long session counts for more
    than a short one; a day of zero-word sessions falls back to their plain average.
    """
    per_day: dict[date, list[SessionRow]] = defaultdict(list)
    for row in rows:
        per_day[local_day(row.created_at, utc_offset_minutes)].append(row)

    trend = []
    for day in sorted(per_day)[-TREND_DAYS:]:
        day_rows = per_day[day]
        words = sum(r.words_read for r in day_rows)
        wpm = (
            sum(r.wpm * r.words_read for r in day_rows) / words
            if words
            else sum(r.wpm for r in day_rows) / len(day_rows)
        )
        trend.append(SpeedPoint(date=day.isoformat(), wpm=round(wpm, 1), words=words))
    return trend
