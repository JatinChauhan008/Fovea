"""Removing documents that never finished processing (real test database)."""

from pathlib import Path

from app.config import get_settings
from app.db import SessionLocal
from app.models import Document, User
from app.services.cleanup import remove_unfinished_documents


def _make_document(db, user: User, status: str) -> Document:
    folder = get_settings().storage_dir / str(user.id)
    folder.mkdir(parents=True, exist_ok=True)
    pdf = folder / f"{status}.pdf"
    tokens = folder / f"{status}.tokens.json"
    pdf.write_bytes(b"%PDF")
    tokens.write_text("[]")
    document = Document(
        user_id=user.id,
        title=status,
        original_filename=f"{status}.pdf",
        stored_path=str(pdf),
        tokens_path=str(tokens),
        status=status,
    )
    db.add(document)
    db.commit()
    return document


def test_removes_failed_and_stuck_documents_and_their_files():
    with SessionLocal() as db:
        user = User(email="cleanup@example.com", hashed_password="x")
        db.add(user)
        db.commit()
        failed = _make_document(db, user, "failed")
        stuck = _make_document(db, user, "processing")
        ready = _make_document(db, user, "ready")
        failed_files = [failed.stored_path, failed.tokens_path]
        stuck_files = [stuck.stored_path, stuck.tokens_path]

        removed = remove_unfinished_documents(db)

        assert removed == 2
        remaining = {d.status for d in db.query(Document).filter(Document.user_id == user.id)}
        assert remaining == {"ready"}
        for path in failed_files + stuck_files:
            assert not Path(path).exists()
        assert Path(ready.stored_path).exists()
