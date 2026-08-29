from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration, overridable via environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Fovea"
    database_url: str = f"sqlite:///{BASE_DIR / 'fovea.db'}"
    storage_dir: Path = BASE_DIR / "storage"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 14

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Uploads
    max_upload_mb: int = 40

    # Reading defaults
    default_wpm: int = 250
    min_wpm: int = 100
    max_wpm: int = 900

    # Sarvam AI (summaries + comprehension quizzes)
    sarvam_api_key: str | None = None
    sarvam_base_url: str = "https://api.sarvam.ai/v1"
    sarvam_model: str = "sarvam-105b"
    sarvam_timeout_seconds: float = 90.0

    @property
    def ai_enabled(self) -> bool:
        return bool(self.sarvam_api_key)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
