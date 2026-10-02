"""End-to-end tests over the HTTP API, from upload through analytics."""

from pathlib import Path

from tests.conftest import make_pdf


def test_health_reports_configuration(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["default_wpm"] > 0


def test_register_login_and_identity(client):
    email = "roundtrip@example.com"
    created = client.post("/auth/register", json={"email": email, "password": "a-good-password"})
    assert created.status_code == 201

    duplicate = client.post("/auth/register", json={"email": email, "password": "a-good-password"})
    assert duplicate.status_code == 409

    logged_in = client.post("/auth/login", data={"username": email, "password": "a-good-password"})
    assert logged_in.status_code == 200

    headers = {"Authorization": f"Bearer {logged_in.json()['access_token']}"}
    assert client.get("/auth/me", headers=headers).json()["email"] == email


def test_wrong_password_is_rejected(client):
    client.post("/auth/register", json={"email": "pw@example.com", "password": "right-password"})
    response = client.post(
        "/auth/login", data={"username": "pw@example.com", "password": "wrong-password"}
    )
    assert response.status_code == 401


def test_documents_require_authentication(client):
    assert client.get("/documents").status_code == 401


def test_upload_extracts_and_tokenizes(document):
    assert document["status"] == "ready"
    assert document["page_count"] == 3
    assert document["word_count"] > 100


def test_upload_rejects_non_pdf(client, auth):
    response = client.post(
        "/upload",
        files={"file": ("notes.txt", b"just some text", "text/plain")},
        headers=auth,
    )
    assert response.status_code == 400


def test_upload_rejects_a_pdf_with_no_text_layer(client, auth):
    import fitz

    empty = fitz.open()
    empty.new_page()
    payload = empty.tobytes()
    empty.close()

    response = client.post(
        "/upload",
        files={"file": ("scan.pdf", payload, "application/pdf")},
        headers=auth,
    )
    assert response.status_code == 422
    assert "OCR" in response.json()["detail"]


def test_a_failed_upload_leaves_nothing_behind(client, auth):
    import fitz

    from app.config import get_settings

    empty = fitz.open()
    empty.new_page()
    payload = empty.tobytes()
    empty.close()

    client.post("/upload", files={"file": ("scan.pdf", payload, "application/pdf")}, headers=auth)

    assert client.get("/documents", headers=auth).json() == []
    user_id = client.get("/auth/me", headers=auth).json()["id"]
    user_dir = get_settings().storage_dir / str(user_id)
    assert not user_dir.exists() or list(user_dir.iterdir()) == []


def test_an_upload_that_breaks_after_extraction_leaves_nothing_behind(client, auth, monkeypatch):
    import pytest

    from app.config import get_settings
    from app.routers import documents

    def broken_title(*_args):
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(documents, "guess_title", broken_title)
    with pytest.raises(RuntimeError):
        client.post(
            "/upload", files={"file": ("ok.pdf", make_pdf(), "application/pdf")}, headers=auth
        )

    assert client.get("/documents", headers=auth).json() == []
    user_id = client.get("/auth/me", headers=auth).json()["id"]
    user_dir = get_settings().storage_dir / str(user_id)
    assert not user_dir.exists() or list(user_dir.iterdir()) == []


def test_sign_up_accepts_a_password_of_72_bytes(client):
    response = client.post(
        "/auth/register", json={"email": "seventy-two@example.com", "password": "a" * 72}
    )
    assert response.status_code == 201


def test_sign_up_rejects_a_password_over_72_bytes_cleanly(client):
    # 25 euro signs are 25 characters but 75 bytes, which bcrypt cannot hash.
    for password in ["a" * 73, "€" * 25]:
        response = client.post(
            "/auth/register", json={"email": "too-long@example.com", "password": password}
        )
        assert response.status_code == 422
        assert "72" in response.json()["detail"][0]["msg"]


def test_content_returns_render_ready_tokens(client, auth, document):
    response = client.get(f"/documents/{document['id']}/content?start=0&limit=25", headers=auth)
    assert response.status_code == 200

    body = response.json()
    assert body["count"] == 25
    assert body["total"] == document["word_count"]

    token = body["tokens"][0]
    assert set(token) == {"t", "o", "m", "p"}
    assert 0 <= token["o"] < len(token["t"])
    assert token["m"] >= 1.0


def test_content_pagination_walks_the_document(client, auth, document):
    first = client.get(f"/documents/{document['id']}/content?start=0&limit=10", headers=auth)
    second = client.get(f"/documents/{document['id']}/content?start=10&limit=10", headers=auth)
    assert first.json()["tokens"] != second.json()["tokens"]


def test_progress_saves_and_resumes(client, auth, document):
    saved = client.post(
        "/progress",
        json={"document_id": document["id"], "word_index": 120, "page": 2, "wpm": 400},
        headers=auth,
    )
    assert saved.status_code == 200
    assert saved.json()["word_index"] == 120
    assert 0 < saved.json()["percent_complete"] < 100
    assert saved.json()["finished"] is False

    resumed = client.get(f"/documents/{document['id']}", headers=auth).json()["progress"]
    assert resumed["word_index"] == 120
    assert resumed["wpm"] == 400
    # The speed they last read at becomes their preferred speed.
    assert client.get("/auth/me", headers=auth).json()["preferred_wpm"] == 400

    # The library listing carries progress so the UI can offer "continue reading".
    listed = client.get("/documents", headers=auth).json()
    assert listed[0]["progress"]["word_index"] == 120


def test_progress_is_clamped_to_the_document(client, auth, document):
    saved = client.post(
        "/progress",
        json={"document_id": document["id"], "word_index": 10**9, "page": 999, "wpm": 300},
        headers=auth,
    )
    assert saved.json()["word_index"] == document["word_count"] - 1
    assert saved.json()["page"] == document["page_count"]
    assert saved.json()["finished"] is True


def test_an_unstarted_document_has_no_place(client, auth, document):
    assert client.get(f"/documents/{document['id']}", headers=auth).json()["progress"] is None


def test_speeds_outside_the_reader_limits_are_refused(client, auth, document):
    for wpm in (50, 1500):
        response = client.post(
            "/progress",
            json={"document_id": document["id"], "word_index": 1, "wpm": wpm},
            headers=auth,
        )
        assert response.status_code == 422


def test_a_logged_stretch_never_counts_past_the_end_of_the_document(client, auth, document):
    created = client.post(
        "/sessions",
        json={
            "document_id": document["id"],
            "start_index": 0,
            "end_index": 10**9,
            "wpm": 300,
            "duration_seconds": 30.0,
        },
        headers=auth,
    )
    assert created.json()["words_read"] == document["word_count"]


def test_sessions_are_logged(client, auth, document):
    created = client.post(
        "/sessions",
        json={
            "document_id": document["id"],
            "start_index": 0,
            "end_index": 400,
            "wpm": 500,
            "duration_seconds": 48.0,
        },
        headers=auth,
    )
    assert created.status_code == 201
    assert created.json()["words_read"] == 400


def test_analytics_aggregate_reading_activity(client, auth, document):
    for start, end, wpm in [(0, 200, 300), (200, 500, 400)]:
        client.post(
            "/sessions",
            json={
                "document_id": document["id"],
                "start_index": start,
                "end_index": end,
                "wpm": wpm,
                "duration_seconds": (end - start) / wpm * 60,
            },
            headers=auth,
        )

    body = client.get("/analytics/summary", headers=auth).json()
    assert body["words_read"] == 500
    assert body["documents_total"] == 1
    assert body["best_wpm"] == 400
    assert body["minutes_read"] > 0
    assert body["current_streak_days"] == 1
    assert len(body["trend"]) == 1
    # Weighted by words read, so the longer 400 WPM stretch pulls the average up.
    assert 300 < body["average_wpm"] <= 400


def test_analytics_are_empty_for_a_new_reader(client, auth):
    body = client.get("/analytics/summary", headers=auth).json()
    assert body["words_read"] == 0
    assert body["current_streak_days"] == 0
    # Other readers' documents exist in the test database; none are counted here.
    assert body["documents_total"] == 0
    assert body["documents_completed"] == 0


def test_a_document_whose_text_has_gone_missing_says_so(client, auth, document):
    from app.db import SessionLocal
    from app.models import Document

    with SessionLocal() as db:
        tokens_path = db.get(Document, document["id"]).tokens_path
    Path(tokens_path).unlink()

    response = client.get(f"/documents/{document['id']}/content", headers=auth)

    assert response.status_code == 410
    assert "missing" in response.json()["detail"]


def test_delete_removes_the_document_and_its_text(client, auth):
    created = client.post(
        "/upload",
        files={"file": ("temp.pdf", make_pdf(pages=1), "application/pdf")},
        headers=auth,
    ).json()

    assert client.delete(f"/documents/{created['id']}", headers=auth).status_code == 204
    assert client.get(f"/documents/{created['id']}", headers=auth).status_code == 404


def test_another_reader_cannot_touch_a_document(client, auth, intruder, document):
    doc_id = document["id"]
    # The owner has a saved place, so a missing ownership check would leak it.
    client.post("/progress", json={"document_id": doc_id, "word_index": 40}, headers=auth)
    session = {
        "document_id": doc_id,
        "start_index": 0,
        "end_index": 50,
        "wpm": 300,
        "duration_seconds": 10.0,
    }

    assert client.get(f"/documents/{doc_id}", headers=intruder).status_code == 404
    assert client.get(f"/documents/{doc_id}/content", headers=intruder).status_code == 404
    assert (
        client.post(
            "/progress", json={"document_id": doc_id, "word_index": 9}, headers=intruder
        ).status_code
        == 404
    )
    assert client.post("/sessions", json=session, headers=intruder).status_code == 404
    assert client.delete(f"/documents/{doc_id}", headers=intruder).status_code == 404

    # Nothing the intruder sent reached the owner's data.
    assert client.get(f"/documents/{doc_id}", headers=auth).json()["progress"]["word_index"] == 40
    assert client.get(f"/documents/{doc_id}/content", headers=auth).status_code == 200
    assert client.get("/analytics/summary", headers=auth).json()["words_read"] == 0
    assert client.get("/documents", headers=intruder).json() == []


def test_a_renamed_non_pdf_is_refused_and_not_kept(client, auth):
    from app.config import get_settings

    response = client.post(
        "/upload", files={"file": ("fake.pdf", b"PK zip bytes", "application/pdf")}, headers=auth
    )

    assert response.status_code == 400
    user_id = client.get("/auth/me", headers=auth).json()["id"]
    user_dir = get_settings().storage_dir / str(user_id)
    assert not user_dir.exists() or list(user_dir.iterdir()) == []
