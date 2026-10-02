from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

DOCUMENT_READY = "ready"


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    preferred_wpm: Mapped[int] = mapped_column(Integer, default=250)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    documents: Mapped[list["Document"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    original_filename: Mapped[str] = mapped_column(String(512))
    stored_path: Mapped[str] = mapped_column(String(1024))
    tokens_path: Mapped[str] = mapped_column(String(1024))
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    # Always "ready" since uploads only create a row once the text is extracted.
    # Older versions also wrote "processing" and "failed"; startup removes those.
    status: Mapped[str] = mapped_column(String(32), default=DOCUMENT_READY)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    owner: Mapped[User] = relationship(back_populates="documents")
    # Named to avoid colliding with the single-reader "progress" field the API returns.
    progress_entries: Mapped[list["Progress"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["ReadingSession"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class Progress(Base):
    """Where a given user left off in a given document."""

    __tablename__ = "progress"
    __table_args__ = (UniqueConstraint("user_id", "document_id", name="uq_progress_user_doc"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    word_index: Mapped[int] = mapped_column(Integer, default=0)
    page: Mapped[int] = mapped_column(Integer, default=1)
    wpm: Mapped[int] = mapped_column(Integer, default=250)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    document: Mapped[Document] = relationship(back_populates="progress_entries")


class ReadingSession(Base):
    """One stretch of actual reading - the raw material for analytics."""

    __tablename__ = "reading_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    start_index: Mapped[int] = mapped_column(Integer, default=0)
    end_index: Mapped[int] = mapped_column(Integer, default=0)
    words_read: Mapped[int] = mapped_column(Integer, default=0)
    wpm: Mapped[int] = mapped_column(Integer, default=250)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    document: Mapped[Document] = relationship(back_populates="sessions")
