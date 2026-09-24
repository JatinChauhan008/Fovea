from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

_DEFAULT_SECRET = "dev-secret-change-me"
_MIN_SECRET_LEN = 32


class Settings(BaseSettings):
    """Runtime configuration, overridable via environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    app_name: str = "Fovea"
    database_url: str = f"sqlite:///{BASE_DIR / 'fovea.db'}"
    storage_dir: Path = BASE_DIR / "storage"

    # Set FOVEA_ENV=development to run locally without a real JWT secret.
    fovea_env: str = "production"

    # Auth
    jwt_secret: str = _DEFAULT_SECRET
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

    @model_validator(mode="after")
    def _validate_jwt_secret(self) -> "Settings":
        is_dev = self.fovea_env.lower() == "development"
        if self.jwt_secret == _DEFAULT_SECRET and not is_dev:
            raise ValueError(
                "JWT_SECRET is set to the public default value. "
                "Anyone can mint valid tokens for any user. "
                "Set JWT_SECRET to a random 32+ character string, "
                "or set FOVEA_ENV=development to suppress this check locally."
            )
        if len(self.jwt_secret) < _MIN_SECRET_LEN and not is_dev:
            raise ValueError(
                f"JWT_SECRET is only {len(self.jwt_secret)} characters. "
                f"Use at least {_MIN_SECRET_LEN} characters (PyJWT recommends 32+ for HS256)."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
