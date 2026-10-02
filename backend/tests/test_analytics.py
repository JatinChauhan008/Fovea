"""Reading stats: the day/streak/trend maths, the database totals, and the endpoint."""

from datetime import UTC, date, datetime, timedelta

from app.db import SessionLocal
from app.models import Document, Progress, ReadingSession, User
from app.queries.analytics import (
    count_finished_documents,
    reading_totals,
    recent_sessions,
)
from app.services.analytics import SessionRow, daily_trend, local_day, reading_streak

IST = 330  # India is UTC+5:30


# --- pure maths ---------------------------------------------------------------


def test_local_day_moves_early_morning_reading_to_the_readers_own_day():
    # 01:00 in India on 2 Oct is still 1 Oct in UTC.
    moment = datetime(2026, 10, 1, 19, 30)
    assert local_day(moment, 0) == date(2026, 10, 1)
    assert local_day(moment, IST) == date(2026, 10, 2)
    assert local_day(moment.replace(tzinfo=UTC), IST) == date(2026, 10, 2)


def test_streak_counts_back_from_today_or_yesterday():
    today = date(2026, 10, 2)
    run = {today - timedelta(days=n) for n in range(3)}
    assert reading_streak(run, today) == 3
    assert reading_streak({d - timedelta(days=1) for d in run}, today) == 3
    assert reading_streak({today - timedelta(days=2)}, today) == 0
    assert reading_streak(set(), today) == 0


def test_trend_groups_by_local_day_and_weights_speed_by_words():
    rows = [
        SessionRow(datetime(2026, 10, 1, 19, 0), words_read=100, wpm=200),
        SessionRow(datetime(2026, 10, 1, 20, 0), words_read=300, wpm=400),
        SessionRow(datetime(2026, 10, 1, 10, 0), words_read=50, wpm=300),
    ]

    trend = daily_trend(rows, IST)

    assert [(p.date, p.wpm, p.words) for p in trend] == [
        ("2026-10-01", 300.0, 50),
        ("2026-10-02", 350.0, 400),
    ]


def test_trend_keeps_only_the_last_30_active_days():
    start = datetime(2026, 1, 1, 12, 0)
    rows = [SessionRow(start + timedelta(days=n), 100, 300) for n in range(40)]

    trend = daily_trend(rows, 0)

    assert len(trend) == 30
    assert trend[0].date == "2026-01-11"


# --- database queries (real test database) ------------------------------------


def _reader_with_history(db) -> User:
    user = User(email=f"stats-{datetime.now().timestamp()}@example.com", hashed_password="x")
    db.add(user)
    db.commit()
    finished = Document(
        user_id=user.id,
        title="a",
        original_filename="a.pdf",
        stored_path="a",
        tokens_path="a",
        word_count=1000,
    )
    halfway = Document(
        user_id=user.id,
        title="b",
        original_filename="b.pdf",
        stored_path="b",
        tokens_path="b",
        word_count=1000,
    )
    db.add_all([finished, halfway])
    db.commit()
    db.add_all(
        [
            Progress(user_id=user.id, document_id=finished.id, word_index=960),
            Progress(user_id=user.id, document_id=halfway.id, word_index=500),
            ReadingSession(
                user_id=user.id,
                document_id=finished.id,
                words_read=600,
                wpm=300,
                duration_seconds=120,
            ),
            ReadingSession(
                user_id=user.id,
                document_id=finished.id,
                words_read=400,
                wpm=500,
                duration_seconds=48,
            ),
            # A two-second blip at a high speed: counted as reading, but not as "fastest".
            ReadingSession(
                user_id=user.id, document_id=halfway.id, words_read=10, wpm=900, duration_seconds=1
            ),
        ]
    )
    db.commit()
    return user


def test_totals_add_up_reading_and_ignore_tiny_stretches_for_fastest():
    with SessionLocal() as db:
        user = _reader_with_history(db)

        totals = reading_totals(db, user.id)

    assert totals.words_read == 1010
    assert totals.seconds == 169
    assert totals.best_wpm == 500
    assert round(totals.average_wpm, 1) == round((600 * 300 + 400 * 500 + 10 * 900) / 1010, 1)


def test_totals_are_zero_for_someone_who_has_not_read():
    with SessionLocal() as db:
        user = User(email="never-read@example.com", hashed_password="x")
        db.add(user)
        db.commit()

        totals = reading_totals(db, user.id)

    assert (totals.words_read, totals.seconds, totals.best_wpm, totals.average_wpm) == (0, 0, 0, 0)


def test_finished_documents_are_those_read_95_percent_through():
    with SessionLocal() as db:
        user = _reader_with_history(db)
        assert count_finished_documents(db, user.id) == 1


def test_recent_sessions_only_returns_sessions_since_the_cutoff():
    with SessionLocal() as db:
        user = _reader_with_history(db)
        old = db.query(ReadingSession).filter(ReadingSession.user_id == user.id).first()
        old.created_at = datetime(2020, 1, 1)
        db.commit()

        rows = recent_sessions(db, user.id, since=datetime(2025, 1, 1))

    assert len(rows) == 2
    assert all(isinstance(row, SessionRow) for row in rows)


# --- endpoint -----------------------------------------------------------------


def test_summary_groups_days_in_the_readers_time_zone(client, auth, document):
    session = {
        "document_id": document["id"],
        "start_index": 0,
        "end_index": 100,
        "wpm": 300,
        "duration_seconds": 20.0,
    }
    client.post("/sessions", json=session, headers=auth)

    # UTC-12 and UTC+14 are 26 hours apart, so the same moment is always on a later
    # day for the reader who is ahead.
    behind = client.get("/analytics/summary?utc_offset_minutes=-720", headers=auth).json()
    ahead = client.get("/analytics/summary?utc_offset_minutes=840", headers=auth).json()

    behind_day = date.fromisoformat(behind["trend"][0]["date"])
    ahead_day = date.fromisoformat(ahead["trend"][0]["date"])
    assert ahead_day > behind_day
    assert ahead["current_streak_days"] == 1
    assert behind["current_streak_days"] == 1


def test_summary_rejects_an_impossible_offset(client, auth):
    assert client.get("/analytics/summary?utc_offset_minutes=9999", headers=auth).status_code == 422
