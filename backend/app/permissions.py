"""
Ownership checks, in one place.

Every route that takes a document id loads it through `get_owned_document`. A document
that belongs to someone else gets the same 404 as one that doesn't exist, so a reader
can't find out which ids other people have; the refusal is logged with both ids.
"""

import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Document, User
from app.queries.documents import find_document

logger = logging.getLogger(__name__)


def get_owned_document(db: Session, document_id: int, user: User) -> Document:
    document = find_document(db, document_id)
    if document is not None and document.user_id == user.id:
        return document
    if document is not None:
        logger.warning(
            "document access denied", extra={"user_id": user.id, "document_id": document_id}
        )
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
