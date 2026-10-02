"""End-to-end tests over the HTTP API, from upload through analytics."""

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


def test_one_reader_cannot_read_anothers_document(client, auth, document):
    other = client.post(
        "/auth/register", json={"email": "intruder@example.com", "password": "another-password"}
    )
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    assert client.get(f"/documents/{document['id']}", headers=headers).status_code == 404
    assert client.get(f"/documents/{document['id']}/content", headers=headers).status_code == 404


def test_progress_saves_and_resumes(client, auth, document):
    saved = client.post(
        "/progress",
        json={"document_id": document["id"], "word_index": 120, "page": 2, "wpm": 400},
        headers=auth,
    )
    assert saved.status_code == 200
    assert saved.json()["word_index"] == 120
    assert 0 < saved.json()["percent_complete"] < 100

    resumed = client.get(f"/progress/{document['id']}", headers=auth).json()
    assert resumed["word_index"] == 120
    assert resumed["wpm"] == 400

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


def test_missing_progress_returns_not_found(client, auth, document):
    assert client.get(f"/progress/{document['id']}", headers=auth).status_code == 404


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
    session = {
        "document_id": doc_id,
        "start_index": 0,
        "end_index": 50,
        "wpm": 300,
        "duration_seconds": 10.0,
    }

    assert client.get(f"/documents/{doc_id}", headers=intruder).status_code == 404
    assert client.get(f"/documents/{doc_id}/content", headers=intruder).status_code == 404
    assert client.get(f"/progress/{doc_id}", headers=intruder).status_code == 404
    assert (
        client.post(
            "/progress", json={"document_id": doc_id, "word_index": 9}, headers=intruder
        ).status_code
        == 404
    )
    assert client.post("/sessions", json=session, headers=intruder).status_code == 404
    assert client.delete(f"/documents/{doc_id}", headers=intruder).status_code == 404

    # Nothing the intruder sent reached the owner's data.
    assert client.get(f"/documents/{doc_id}", headers=auth).json()["progress"] is None
    assert client.get("/analytics/summary", headers=auth).json()["words_read"] == 0
    assert client.get("/documents", headers=intruder).json() == []
