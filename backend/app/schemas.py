from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# --- auth ---------------------------------------------------------------

# bcrypt only hashes the first 72 bytes, and the installed version refuses longer input.
MAX_PASSWORD_BYTES = 72


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def _fits_bcrypt(cls, password: str) -> str:
        if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
            raise ValueError(
                f"Password is too long: use at most {MAX_PASSWORD_BYTES} bytes "
                "(72 plain letters, fewer with accents or symbols)"
            )
        return password


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


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    words_read: int
    wpm: int
    duration_seconds: float
    created_at: datetime


# --- analytics --------------------------------------------------------


class SpeedPoint(BaseModel):
    date: str
    wpm: float
    words: int


class AnalyticsSummary(BaseModel):
    documents_total: int
    documents_completed: int
    words_read: int
    minutes_read: float
    average_wpm: float
    best_wpm: float
    current_streak_days: int
    trend: list[SpeedPoint]


DocumentWithProgress.model_rebuild()
