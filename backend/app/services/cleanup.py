"""
Removes documents that never finished processing, along with their files.

Older versions saved a placeholder row before extracting the text and left it behind
("failed", or "processing" after a crash). Those rows showed up in the library as empty,
unreadable documents. Uploads no longer create them, so this runs once at startup to
clear out any that remain. Returns how many were removed.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DOCUMENT_READY, Document
from app.services.storage import remove_files


def remove_unfinished_documents(db: Session) -> int:
    unfinished = list(db.scalars(select(Document).where(Document.status != DOCUMENT_READY)))
    for document in unfinished:
        remove_files(document.stored_path, document.tokens_path)
        db.delete(document)
    db.commit()
    return len(unfinished)
