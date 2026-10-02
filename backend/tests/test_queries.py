"""Database helpers and the ownership check, against the real test database."""

import uuid

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import Progress, ReadingSession, User
from app.permissions import get_owned_document
from app.queries.documents import create_document, delete_document, list_documents
from app.queries.progress import find_progress, progress_by_document, save_progress
from app.queries.sessions import add_reading_session
from app.queries.users import EmailTaken, create_user, find_user_by_email


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def _reader(db) -> User:
    return create_user(
        db, email=f"q-{uuid.uuid4().hex[:8]}@example.com", hashed_password="x", preferred_wpm=250
    )


def _document(db, user: User, title: str = "Book"):
    return create_document(
        db,
        user_id=user.id,
        title=title,
        original_filename=f"{title}.pdf",
        stored_path="nowhere.pdf",
        tokens_path="nowhere.json",
        page_count=10,
        word_count=1000,
    )


def test_create_user_stores_the_email_in_lower_case_and_finds_it_either_way(db):
    user = create_user(db, email="Mixed@Example.com", hashed_password="x", preferred_wpm=250)

    assert user.email == "mixed@example.com"
    assert find_user_by_email(db, "MIXED@example.COM").id == user.id
    assert find_user_by_email(db, "nobody@example.com") is None


def test_create_user_refuses_an_email_that_is_already_registered(db):
    create_user(db, email="twice@example.com", hashed_password="x", preferred_wpm=250)

    with pytest.raises(EmailTaken):
        create_user(db, email="TWICE@example.com", hashed_password="y", preferred_wpm=250)


def test_list_documents_returns_only_the_readers_own_newest_first(db):
    reader, other = _reader(db), _reader(db)
    first = _document(db, reader, "First")
    second = _document(db, reader, "Second")
    _document(db, other, "Not yours")

    assert [d.id for d in list_documents(db, reader.id)] == [second.id, first.id]


def test_deleting_a_document_removes_its_place_and_reading_history(db):
    reader = _reader(db)
    document = _document(db, reader)
    save_progress(db, reader, document.id, word_index=5, page=1, wpm=300)
    add_reading_session(
        db,
        user_id=reader.id,
        document_id=document.id,
        start_index=0,
        end_index=5,
        words_read=5,
        wpm=300,
        duration_seconds=1.0,
    )

    delete_document(db, document)

    assert db.query(Progress).filter_by(document_id=document.id).count() == 0
    assert db.query(ReadingSession).filter_by(document_id=document.id).count() == 0


def test_save_progress_creates_then_updates_one_place_and_remembers_the_speed(db):
    reader = _reader(db)
    document = _document(db, reader)

    save_progress(db, reader, document.id, word_index=10, page=1, wpm=300)
    save_progress(db, reader, document.id, word_index=40, page=2, wpm=450)

    place = find_progress(db, reader.id, document.id)
    assert (place.word_index, place.page, place.wpm) == (40, 2, 450)
    assert list(progress_by_document(db, reader.id)) == [document.id]
    db.refresh(reader)
    assert reader.preferred_wpm == 450


def test_the_owner_can_load_their_document(db):
    reader = _reader(db)
    document = _document(db, reader)

    assert get_owned_document(db, document.id, reader).id == document.id


def test_someone_elses_document_looks_exactly_like_a_missing_one(db):
    owner, stranger = _reader(db), _reader(db)
    document = _document(db, owner)

    with pytest.raises(HTTPException) as theirs:
        get_owned_document(db, document.id, stranger)
    with pytest.raises(HTTPException) as missing:
        get_owned_document(db, 10**9, stranger)

    assert theirs.value.status_code == missing.value.status_code == 404
    assert theirs.value.detail == missing.value.detail
