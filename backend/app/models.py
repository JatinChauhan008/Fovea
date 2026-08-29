from datetime import datetime, timezone

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


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    status: Mapped[str] = mapped_column(String(32), default="ready")  # ready | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    owner: Mapped[User] = relationship(back_populates="documents")
    # Named to avoid colliding with the single-reader "progress" field the API returns.
    progress_entries: Mapped[list["Progress"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["ReadingSession"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    quizzes: Mapped[list["Quiz"]] = relationship(
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
    """One stretch of actual reading - the raw material for analytics and adaptation."""

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
    comprehension: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0..1
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    document: Mapped[Document] = relationship(back_populates="sessions")


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    start_index: Mapped[int] = mapped_column(Integer, default=0)
    end_index: Mapped[int] = mapped_column(Integer, default=0)
    wpm: Mapped[int] = mapped_column(Integer, default=250)
    questions_json: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(32), default="ai")  # ai | heuristic
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    document: Mapped[Document] = relationship(back_populates="quizzes")
    attempts: Mapped[list["QuizAttempt"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan"
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    answers_json: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    quiz: Mapped[Quiz] = relationship(back_populates="attempts")
