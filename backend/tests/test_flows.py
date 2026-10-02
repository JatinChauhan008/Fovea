"""
Flow tests: each route's orchestration with its helpers mocked - the right helpers,
in the right order, with the right arguments, and the right handling of failures.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, call

import pytest
from fastapi import HTTPException

from app.queries.users import EmailTaken
from app.routers import analytics, auth, documents, progress
from app.schemas import ProgressIn, SessionIn, UserCreate
from app.services.extraction import ExtractedPdf
from app.services.pdf_service import PdfExtractionError
from app.services.uploads import UploadRejected

READER = MagicMock(id=7)


@pytest.fixture
def upload_steps(monkeypatch, tmp_path):
    """Mock every helper the upload flow calls, recording the order they run in."""
    steps = MagicMock()
    steps.new_document_paths.return_value = (tmp_path / "a.pdf", tmp_path / "a.json")
    steps.extract_pdf.return_value = ExtractedPdf(page_count=3, word_count=900, title="")
    steps.guess_title.return_value = "A Title"
    steps.create_document.return_value = MagicMock(id=1, page_count=3, word_count=900)
    for name in (
        "new_document_paths",
        "check_pdf_filename",
        "store_upload",
        "check_real_pdf",
        "check_storage_room",
        "extract_pdf",
        "guess_title",
        "create_document",
        "remove_files",
    ):
        monkeypatch.setattr(documents, name, getattr(steps, name))
    monkeypatch.setattr(
        documents.DocumentOut, "model_validate", staticmethod(lambda document: document)
    )
    return steps


def _upload(file_name: str = "a.pdf"):
    return documents.upload(file=MagicMock(filename=file_name), user=READER, db=MagicMock())


def test_upload_checks_stores_extracts_then_saves(upload_steps):
    _upload()

    called = [c[0] for c in upload_steps.method_calls]
    assert called == [
        "new_document_paths",
        "check_pdf_filename",
        "store_upload",
        "check_real_pdf",
        "check_storage_room",
        "extract_pdf",
        "guess_title",
        "create_document",
    ]
    assert upload_steps.create_document.call_args.kwargs["word_count"] == 900
    upload_steps.remove_files.assert_not_called()


def test_upload_turns_a_refusal_into_its_status_and_cleans_up(upload_steps):
    upload_steps.check_real_pdf.side_effect = UploadRejected(400, "That file is not a valid PDF")

    with pytest.raises(HTTPException) as refused:
        _upload()

    assert refused.value.status_code == 400
    upload_steps.remove_files.assert_called_once()
    upload_steps.extract_pdf.assert_not_called()
    upload_steps.create_document.assert_not_called()


def test_upload_answers_422_when_the_pdf_has_no_usable_text(upload_steps):
    upload_steps.extract_pdf.side_effect = PdfExtractionError("needs OCR")

    with pytest.raises(HTTPException) as refused:
        _upload()

    assert (refused.value.status_code, refused.value.detail) == (422, "needs OCR")
    upload_steps.remove_files.assert_called_once()
    upload_steps.create_document.assert_not_called()


def test_upload_cleans_up_and_lets_an_unexpected_error_surface(upload_steps):
    upload_steps.create_document.side_effect = RuntimeError("database down")

    with pytest.raises(RuntimeError):
        _upload()

    upload_steps.remove_files.assert_called_once()


def test_deleting_removes_the_row_before_the_files(monkeypatch):
    steps = MagicMock()
    steps.get_owned_document.return_value = MagicMock(stored_path="a.pdf", tokens_path="a.json")
    for name in ("get_owned_document", "delete_document", "remove_files"):
        monkeypatch.setattr(documents, name, getattr(steps, name))

    documents.remove_document(document_id=5, user=READER, db=MagicMock())

    assert [c[0] for c in steps.method_calls] == [
        "get_owned_document",
        "delete_document",
        "remove_files",
    ]
    steps.remove_files.assert_called_once_with("a.pdf", "a.json")


def test_saving_a_place_clamps_it_before_saving(monkeypatch):
    document = MagicMock(id=3, word_count=100)
    monkeypatch.setattr(progress, "get_owned_document", MagicMock(return_value=document))
    monkeypatch.setattr(progress, "clamp_position", MagicMock(return_value=(99, 4)))
    save = MagicMock()
    monkeypatch.setattr(progress, "save_progress", save)
    monkeypatch.setattr(progress, "progress_out", MagicMock())
    db = MagicMock()

    progress.save_place(
        ProgressIn(document_id=3, word_index=5000, page=40, wpm=300), user=READER, db=db
    )

    save.assert_called_once_with(db, READER, 3, word_index=99, page=4, wpm=300)


def test_logging_a_stretch_saves_the_clamped_word_count(monkeypatch):
    document = MagicMock(id=3, word_count=100)
    monkeypatch.setattr(progress, "get_owned_document", MagicMock(return_value=document))
    monkeypatch.setattr(progress, "words_in_stretch", MagicMock(return_value=42))
    add = MagicMock()
    monkeypatch.setattr(progress, "add_reading_session", add)
    monkeypatch.setattr(progress.SessionOut, "model_validate", staticmethod(lambda s: s))

    progress.log_reading(
        SessionIn(document_id=3, start_index=0, end_index=500, wpm=300, duration_seconds=9),
        user=READER,
        db=MagicMock(),
    )

    assert add.call_args.kwargs["words_read"] == 42


def _sign_up(monkeypatch, *, existing=None, create_error=None):
    monkeypatch.setattr(auth, "enforce_rate_limit", MagicMock())
    monkeypatch.setattr(auth, "find_user_by_email", MagicMock(return_value=existing))
    monkeypatch.setattr(auth, "hash_password", MagicMock(return_value="hashed"))
    create = MagicMock(side_effect=create_error)
    monkeypatch.setattr(auth, "create_user", create)
    request = MagicMock(client=MagicMock(host="1.2.3.4"))
    payload = UserCreate(email="new@example.com", password="long-enough")
    return create, lambda: auth.register(payload, request, db=MagicMock())


def test_sign_up_refuses_a_registered_email_without_creating_anything(monkeypatch):
    create, register = _sign_up(monkeypatch, existing=MagicMock())

    with pytest.raises(HTTPException) as refused:
        register()

    assert refused.value.status_code == 409
    create.assert_not_called()


def test_sign_up_answers_409_when_the_same_email_signs_up_at_the_same_moment(monkeypatch):
    _, register = _sign_up(monkeypatch, create_error=EmailTaken())

    with pytest.raises(HTTPException) as refused:
        register()

    assert refused.value.status_code == 409


def test_sign_in_counts_the_attempt_before_checking_the_password(monkeypatch):
    steps = MagicMock()
    steps.find_user_by_email.return_value = None
    for name in ("enforce_rate_limit", "find_user_by_email"):
        monkeypatch.setattr(auth, name, getattr(steps, name))
    form = MagicMock(username="a@example.com", password="nope")

    with pytest.raises(HTTPException) as refused:
        auth.login(MagicMock(client=MagicMock(host="1.2.3.4")), form=form, db=MagicMock())

    assert refused.value.status_code == 401
    assert [c[0] for c in steps.method_calls] == ["enforce_rate_limit", "find_user_by_email"]


def test_stats_use_the_readers_offset_for_every_day_calculation(monkeypatch):
    totals = MagicMock(words_read=0, seconds=0.0, average_wpm=0.0, best_wpm=0)
    monkeypatch.setattr(analytics, "reading_totals", MagicMock(return_value=totals))
    monkeypatch.setattr(analytics, "count_documents", MagicMock(return_value=0))
    monkeypatch.setattr(analytics, "count_finished_documents", MagicMock(return_value=0))
    monkeypatch.setattr(analytics, "recent_sessions", MagicMock(return_value=[]))
    day = MagicMock(return_value=datetime(2026, 10, 2, tzinfo=UTC).date())
    trend = MagicMock(return_value=[])
    monkeypatch.setattr(analytics, "local_day", day)
    monkeypatch.setattr(analytics, "daily_trend", trend)

    analytics.summary(utc_offset_minutes=330, user=READER, db=MagicMock())

    assert all(c.args[1] == 330 for c in day.call_args_list)
    assert trend.call_args == call([], 330)
