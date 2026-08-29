from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- auth ---------------------------------------------------------------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    preferred_wpm: int
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- documents ----------------------------------------------------------

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_filename: str
    page_count: int
    word_count: int
    status: str
    error: str | None = None
    summary: str | None = None
    summary_source: str | None = None
    created_at: datetime


class DocumentWithProgress(DocumentOut):
    progress: "ProgressOut | None" = None


class TokenOut(BaseModel):
    t: str
    o: int
    m: float
    p: int


class ContentOut(BaseModel):
    document_id: int
    start: int
    count: int
    total: int
    page_count: int
    tokens: list[TokenOut]


# --- progress & sessions ------------------------------------------------

class ProgressIn(BaseModel):
    document_id: int
    word_index: int = Field(ge=0)
    page: int = Field(ge=1, default=1)
    wpm: int = Field(ge=50, le=1500, default=250)


class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: int
    word_index: int
    page: int
    wpm: int
    updated_at: datetime
    percent_complete: float = 0.0


class SessionIn(BaseModel):
    document_id: int
    start_index: int = Field(ge=0)
    end_index: int = Field(ge=0)
    wpm: int = Field(ge=50, le=1500)
    duration_seconds: float = Field(ge=0)
    comprehension: float | None = Field(default=None, ge=0, le=1)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    words_read: int
    wpm: int
    duration_seconds: float
    comprehension: float | None
    created_at: datetime


# --- adaptive & analytics ----------------------------------------------

class Recommendation(BaseModel):
    recommended_wpm: int
    current_wpm: int
    confidence: str  # none | low | medium | high
    rationale: str
    samples: int
    average_comprehension: float | None = None


class SpeedPoint(BaseModel):
    date: str
    wpm: float
    comprehension: float | None = None
    words: int


class AnalyticsSummary(BaseModel):
    documents_total: int
    documents_completed: int
    words_read: int
    minutes_read: float
    average_wpm: float
    best_wpm: float
    average_comprehension: float | None
    current_streak_days: int
    trend: list[SpeedPoint]


# --- AI -----------------------------------------------------------------

class SummaryOut(BaseModel):
    document_id: int
    summary: str
    source: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer_index: int
    explanation: str | None = None


class QuizRequest(BaseModel):
    document_id: int
    start_index: int = Field(ge=0)
    end_index: int = Field(ge=0)
    wpm: int = Field(ge=50, le=1500, default=250)
    num_questions: int = Field(ge=1, le=8, default=4)


class QuizOut(BaseModel):
    id: int
    document_id: int
    source: str
    questions: list[QuizQuestion]


class QuizSubmission(BaseModel):
    answers: list[int]


class QuizResult(BaseModel):
    quiz_id: int
    score: float
    correct: int
    total: int
    answer_key: list[int]
    explanations: list[str | None]
    recommendation: Recommendation


DocumentWithProgress.model_rebuild()
