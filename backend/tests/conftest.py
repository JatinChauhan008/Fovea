import os
import tempfile
from pathlib import Path

# Point the app at a throwaway database and storage directory before any app
# module reads its settings.
_TMP = Path(tempfile.mkdtemp(prefix="fovea-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["STORAGE_DIR"] = str(_TMP / "storage")
os.environ["JWT_SECRET"] = "test-secret"

import fitz  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402

PASSAGE = (
    "Rapid serial visual presentation displays one word at a time in a fixed position. "
    "The technique removes saccadic eye movement, which normally consumes a substantial "
    "fraction of ordinary reading time. Researchers measured comprehension across "
    "presentation speeds ranging from two hundred to eight hundred words per minute. "
    "Comprehension remained stable until roughly five hundred words per minute, after "
    "which retention declined sharply for unfamiliar technical material. The optimal "
    "recognition point describes the letter a reader fixates when identifying a word. "
    "Highlighting that letter reduces the horizontal adjustment the eye would otherwise "
    "perform. Longer words require the fixation point to sit further from the beginning. "
    "Punctuation signals boundaries between clauses, and readers benefit from additional "
    "time at those boundaries. Adaptive systems adjust presentation speed by measuring "
    "retention after each section of material. "
)


def make_pdf(pages: int = 3, body: str = PASSAGE) -> bytes:
    document = fitz.open()
    for number in range(1, pages + 1):
        page = document.new_page()
        page.insert_textbox(
            fitz.Rect(50, 50, 545, 780),
            f"Chapter {number}\n\n{body * 2}",
            fontsize=11,
        )
        # A running head, repeated on every page - the tokenizer should drop it.
        page.insert_text(fitz.Point(50, 30), "Fovea Technical Report")
    data = document.tobytes()
    document.close()
    return data


@pytest.fixture(scope="session", autouse=True)
def _database():
    init_db()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth(client):
    """Register a fresh user and return ready-to-use auth headers."""
    import uuid

    email = f"reader-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/auth/register", json={"email": email, "password": "correct-horse-battery"}
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def document(client, auth):
    response = client.post(
        "/upload",
        files={"file": ("report.pdf", make_pdf(), "application/pdf")},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()
