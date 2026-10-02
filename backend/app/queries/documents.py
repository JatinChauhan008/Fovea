"""
Database reads and writes for documents.

- find_document: one document by id, whoever owns it (ownership is checked by
  app.permissions.get_owned_document, which is what routes call).
- list_documents: a reader's documents, newest first, at most LIBRARY_LIMIT of them
  (served by the index on documents.user_id).
- create_document / delete_document: save a new, fully processed document, or remove
  one along with its progress and sessions (ORM cascade). Both commit.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DOCUMENT_READY, Document

# A personal library this big is unusual; the cap keeps the list response bounded.
LIBRARY_LIMIT = 1000


def find_document(db: Session, document_id: int) -> Document | None:
    return db.get(Document, document_id)


def list_documents(db: Session, user_id: int) -> list[Document]:
    newest_first = (
        select(Document)
        .where(Document.user_id == user_id)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .limit(LIBRARY_LIMIT)
    )
    return list(db.scalars(newest_first))


def create_document(
    db: Session,
    *,
    user_id: int,
    title: str,
    original_filename: str,
    stored_path: str,
    tokens_path: str,
    page_count: int,
    word_count: int,
) -> Document:
    document = Document(
        user_id=user_id,
        title=title,
        original_filename=original_filename,
        stored_path=stored_path,
        tokens_path=tokens_path,
        page_count=page_count,
        word_count=word_count,
        status=DOCUMENT_READY,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def delete_document(db: Session, document: Document) -> None:
    db.delete(document)
    db.commit()
