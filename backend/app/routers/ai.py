import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Quiz, QuizAttempt, ReadingSession, User
from app.routers.documents import get_owned_document
from app.schemas import (
    QuizOut,
    QuizQuestion,
    QuizRequest,
    QuizResult,
    QuizSubmission,
    Recommendation,
    SummaryOut,
)
from app.security import get_current_user
from app.services.adaptive import Sample, recommend
from app.services.llm import generate_quiz, generate_summary
from app.services.pdf_service import read_tokens
from app.services.tokenizer import tokens_to_text

router = APIRouter(tags=["ai"])
settings = get_settings()

# How much text a summary is allowed to draw on.
SUMMARY_TOKEN_WINDOW = 4000
# A quiz needs enough material to ask about.
MIN_QUIZ_WORDS = 60


def _load_tokens(document) -> list[dict]:
    try:
        return read_tokens(Path(document.tokens_path))
    except FileNotFoundError as exc:
        raise HTTPException(
            status.HTTP_410_GONE, "The processed text for this document is missing"
        ) from exc


@router.get("/ai/status")
def ai_status() -> dict:
    """Lets the UI say honestly whether answers come from Sarvam or the local fallback."""
    return {
        "provider": "sarvam",
        "model": settings.sarvam_model,
        "enabled": settings.ai_enabled,
        "fallback": "local heuristic generator",
    }


@router.post("/documents/{document_id}/summary", response_model=SummaryOut)
async def create_summary(
    document_id: int,
    refresh: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SummaryOut:
    document = get_owned_document(document_id, user, db)

    if document.summary and not refresh:
        return SummaryOut(
            document_id=document.id,
            summary=document.summary,
            source=document.summary_source or "cached",
        )

    tokens = _load_tokens(document)
    text = tokens_to_text(tokens, 0, SUMMARY_TOKEN_WINDOW)
    summary, source = await generate_summary(text)

    document.summary = summary
    document.summary_source = source
    db.commit()

    return SummaryOut(document_id=document.id, summary=summary, source=source)


@router.post("/quiz", response_model=QuizOut, status_code=status.HTTP_201_CREATED)
async def create_quiz(
    payload: QuizRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizOut:
    """Generate a comprehension check for the stretch the reader just covered."""
    document = get_owned_document(payload.document_id, user, db)
    tokens = _load_tokens(document)

    start = min(payload.start_index, len(tokens))
    end = min(max(payload.end_index, start), len(tokens))

    if end - start < MIN_QUIZ_WORDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Read at least {MIN_QUIZ_WORDS} words before taking a comprehension check",
        )

    text = tokens_to_text(tokens, start, end)
    questions, source = await generate_quiz(text, payload.num_questions)

    if not questions:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Could not generate questions for this passage. Try a longer stretch of text.",
        )

    quiz = Quiz(
        document_id=document.id,
        user_id=user.id,
        start_index=start,
        end_index=end,
        wpm=payload.wpm,
        questions_json=json.dumps(questions, ensure_ascii=False),
        source=source,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    # The answer key never leaves the server until the attempt is submitted.
    return QuizOut(
        id=quiz.id,
        document_id=document.id,
        source=source,
        questions=[
            QuizQuestion(question=q["question"], options=q["options"], answer_index=-1)
            for q in questions
        ],
    )


@router.post("/quiz/{quiz_id}/attempt", response_model=QuizResult)
def submit_quiz(
    quiz_id: int,
    payload: QuizSubmission,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuizResult:
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or quiz.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")

    questions = json.loads(quiz.questions_json)
    if len(payload.answers) != len(questions):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Expected {len(questions)} answers, got {len(payload.answers)}",
        )

    key = [q["answer_index"] for q in questions]
    correct = sum(1 for given, expected in zip(payload.answers, key) if given == expected)
    score = correct / len(questions) if questions else 0.0

    db.add(
        QuizAttempt(
            quiz_id=quiz.id,
            user_id=user.id,
            answers_json=json.dumps(payload.answers),
            score=score,
        )
    )

    # Attach the score to the reading it measures, so the adaptive engine sees it.
    session = db.scalar(
        select(ReadingSession)
        .where(
            ReadingSession.user_id == user.id,
            ReadingSession.document_id == quiz.document_id,
            ReadingSession.comprehension.is_(None),
            ReadingSession.end_index >= quiz.start_index,
            ReadingSession.start_index <= quiz.end_index,
        )
        .order_by(ReadingSession.created_at.desc())
    )

    if session is None:
        words = max(quiz.end_index - quiz.start_index, 0)
        session = ReadingSession(
            user_id=user.id,
            document_id=quiz.document_id,
            start_index=quiz.start_index,
            end_index=quiz.end_index,
            words_read=words,
            wpm=quiz.wpm,
            duration_seconds=(words / quiz.wpm * 60) if quiz.wpm else 0.0,
        )
        db.add(session)

    session.comprehension = score
    db.commit()

    samples = [
        Sample(wpm=s.wpm, comprehension=s.comprehension or 0.0)
        for s in db.scalars(
            select(ReadingSession)
            .where(
                ReadingSession.user_id == user.id,
                ReadingSession.comprehension.is_not(None),
            )
            .order_by(ReadingSession.created_at.asc())
        )
    ]

    recommendation = recommend(
        samples,
        current_wpm=quiz.wpm or user.preferred_wpm,
        min_wpm=settings.min_wpm,
        max_wpm=settings.max_wpm,
        default_wpm=settings.default_wpm,
    )

    return QuizResult(
        quiz_id=quiz.id,
        score=round(score, 3),
        correct=correct,
        total=len(questions),
        answer_key=key,
        explanations=[q.get("explanation") for q in questions],
        recommendation=Recommendation(**recommendation),
    )
