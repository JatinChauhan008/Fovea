"""Upload hardening: size caps, storage limits, unreadable files and slow extraction."""

import pytest

from app.config import get_settings
from tests.conftest import make_pdf


@pytest.fixture
def settings(monkeypatch):
    """The live settings object, so a test can shrink a limit for its own duration."""
    return get_settings()


def _stored_files(client, auth) -> list:
    user_id = client.get("/auth/me", headers=auth).json()["id"]
    folder = get_settings().storage_dir / str(user_id)
    return list(folder.iterdir()) if folder.exists() else []


def test_an_oversized_upload_is_refused_from_its_declared_size(client, auth, settings, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    big = make_pdf() + b"0" * (2 * 1024 * 1024)

    response = client.post(
        "/upload", files={"file": ("big.pdf", big, "application/pdf")}, headers=auth
    )

    assert response.status_code == 413
    assert _stored_files(client, auth) == []


def test_an_oversized_upload_without_a_declared_size_is_cut_off(
    client, auth, settings, monkeypatch
):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    boundary = "fovea-boundary"
    head = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.pdf"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
    ).encode()

    def body():
        yield head
        for _ in range(3):
            yield b"0" * (1024 * 1024)
        yield f"\r\n--{boundary}--\r\n".encode()

    response = client.post(
        "/upload",
        content=body(),
        headers={**auth, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )

    assert response.status_code == 413
    assert _stored_files(client, auth) == []


def test_uploads_stop_once_a_reader_runs_out_of_storage(client, auth, settings, monkeypatch):
    first = client.post(
        "/upload", files={"file": ("one.pdf", make_pdf(), "application/pdf")}, headers=auth
    )
    assert first.status_code == 201
    used = sum(f.stat().st_size for f in _stored_files(client, auth))
    monkeypatch.setattr(settings, "max_storage_mb", used / (1024 * 1024))

    second = client.post(
        "/upload", files={"file": ("two.pdf", make_pdf(), "application/pdf")}, headers=auth
    )

    assert second.status_code == 413
    assert "storage" in second.json()["detail"]
    assert len(client.get("/documents", headers=auth).json()) == 1
    assert sum(f.stat().st_size for f in _stored_files(client, auth)) == used


def test_an_unreadable_pdf_gets_a_plain_message(client, auth):
    response = client.post(
        "/upload",
        files={"file": ("broken.pdf", b"%PDF-1.7 this is not really a pdf", "application/pdf")},
        headers=auth,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "This file couldn't be read as a PDF."
    assert _stored_files(client, auth) == []


def test_a_pdf_that_takes_too_long_is_given_up_on(client, auth, settings, monkeypatch):
    monkeypatch.setattr(settings, "pdf_timeout_seconds", 0.01)

    response = client.post(
        "/upload", files={"file": ("slow.pdf", make_pdf(), "application/pdf")}, headers=auth
    )

    assert response.status_code == 422
    assert "too long" in response.json()["detail"]
    assert _stored_files(client, auth) == []
