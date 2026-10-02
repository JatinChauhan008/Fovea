"""File helpers for uploads, and how extraction reports a crashed worker."""

import io
import subprocess
from pathlib import Path

import pytest

from app.services import extraction
from app.services.pdf_service import PdfExtractionError
from app.services.storage import UploadTooLarge, save_upload, storage_used_bytes


def test_save_upload_copies_the_file_and_returns_its_size(tmp_path):
    destination = tmp_path / "doc.pdf"

    size = save_upload(io.BytesIO(b"%PDF-1.7 body"), destination, max_bytes=100)

    assert size == 13
    assert destination.read_bytes() == b"%PDF-1.7 body"


def test_save_upload_stops_and_leaves_nothing_once_over_the_limit(tmp_path):
    destination = tmp_path / "doc.pdf"

    with pytest.raises(UploadTooLarge):
        save_upload(io.BytesIO(b"x" * 101), destination, max_bytes=100)

    assert not destination.exists()


def test_storage_used_adds_up_the_files_in_a_folder(tmp_path):
    (tmp_path / "a.pdf").write_bytes(b"x" * 10)
    (tmp_path / "a.tokens.json").write_bytes(b"x" * 5)

    assert storage_used_bytes(tmp_path) == 15
    assert storage_used_bytes(tmp_path / "missing") == 0


def test_a_crashed_worker_is_reported_as_an_unreadable_pdf(tmp_path, monkeypatch):
    def crashed(*_args, **_kwargs):
        return subprocess.CompletedProcess([], returncode=1, stdout="", stderr="Segfault")

    monkeypatch.setattr(extraction.subprocess, "run", crashed)

    # A crash is the file's fault as far as the reader can tell, and must become a
    # plain 422: an unhandled 500 reaches the browser without CORS headers and looks
    # like "server down".
    with pytest.raises(PdfExtractionError, match="couldn't be read as a PDF"):
        extraction.extract_pdf(tmp_path / "a.pdf", tmp_path / "a.json", timeout_seconds=5)


def test_library_notices_before_the_answer_are_ignored(tmp_path, monkeypatch):
    output = 'warning: something\n{"page_count": 2, "word_count": 40, "title": "T"}\n'

    def noisy(*_args, **_kwargs):
        return subprocess.CompletedProcess([], returncode=0, stdout=output, stderr="")

    monkeypatch.setattr(extraction.subprocess, "run", noisy)

    result = extraction.extract_pdf(tmp_path / "a.pdf", tmp_path / "a.json", timeout_seconds=5)

    assert (result.page_count, result.word_count, result.title) == (2, 40, "T")


def test_extraction_works_with_relative_paths_from_another_folder(tmp_path, monkeypatch):
    from tests.conftest import make_pdf

    monkeypatch.chdir(tmp_path)
    (tmp_path / "doc.pdf").write_bytes(make_pdf(pages=1))

    result = extraction.extract_pdf(Path("doc.pdf"), Path("doc.json"), timeout_seconds=60)

    assert result.word_count > 0
    assert (tmp_path / "doc.json").exists()
