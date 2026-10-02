"""The pure rules for a reader's place, logged stretches, and upload checks."""

import io
from datetime import datetime

import pytest

from app.models import Document, Progress
from app.services.reading import clamp_position, progress_out, words_in_stretch
from app.services.uploads import (
    UploadRejected,
    check_pdf_filename,
    check_real_pdf,
    check_storage_room,
    store_upload,
)

BOOK = Document(word_count=1000, page_count=10)


def test_clamp_position_keeps_the_place_inside_the_document():
    assert clamp_position(500, 5, BOOK) == (500, 5)
    assert clamp_position(5000, 50, BOOK) == (999, 10)
    assert clamp_position(-3, 0, BOOK) == (0, 1)
    assert clamp_position(7, 3, Document(word_count=0, page_count=0)) == (0, 1)


def test_words_in_stretch_never_counts_past_the_end_or_backwards():
    assert words_in_stretch(100, 250, 1000) == 150
    assert words_in_stretch(900, 5000, 1000) == 100
    assert words_in_stretch(300, 200, 1000) == 0


def _place(word_index: int) -> Progress:
    return Progress(
        document_id=1, word_index=word_index, page=1, wpm=300, updated_at=datetime.now()
    )


def test_progress_out_reports_percent_and_finished_at_95_percent():
    assert progress_out(None, 1000) is None
    halfway = progress_out(_place(500), 1000)
    assert (halfway.percent_complete, halfway.finished) == (50.0, False)
    nearly = progress_out(_place(949), 1000)
    assert nearly.finished is False
    done = progress_out(_place(950), 1000)
    assert done.finished is True
    assert progress_out(_place(3), 0).percent_complete == 0.0


def test_only_pdf_names_are_accepted():
    check_pdf_filename("Report.PDF")
    with pytest.raises(UploadRejected) as rejected:
        check_pdf_filename("notes.txt")
    assert rejected.value.status_code == 400


def test_a_file_that_does_not_start_like_a_pdf_is_refused(tmp_path):
    real, fake = tmp_path / "real.pdf", tmp_path / "fake.pdf"
    real.write_bytes(b"%PDF-1.7")
    fake.write_bytes(b"PK\x03\x04")

    check_real_pdf(real)
    with pytest.raises(UploadRejected):
        check_real_pdf(fake)


def test_an_upload_over_the_size_limit_is_refused_with_413(tmp_path):
    with pytest.raises(UploadRejected) as rejected:
        store_upload(io.BytesIO(b"x" * (2 * 1024 * 1024)), tmp_path / "big.pdf", max_upload_mb=1)
    assert rejected.value.status_code == 413
    assert not (tmp_path / "big.pdf").exists()


def test_a_full_storage_folder_refuses_more(tmp_path):
    (tmp_path / "a.pdf").write_bytes(b"x" * 2048)

    check_storage_room(tmp_path, max_storage_mb=1)
    with pytest.raises(UploadRejected) as rejected:
        check_storage_room(tmp_path, max_storage_mb=1 / 1024)
    assert rejected.value.status_code == 413
