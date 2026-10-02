import logging
from contextlib import asynccontextmanager
from typing import TypedDict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.logging_setup import configure_logging, log_requests
from app.routers import analytics, auth, documents, progress
from app.services.cleanup import remove_unfinished_documents
from app.upload_limit import UploadSizeLimit

configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()


class DocsUrls(TypedDict):
    docs_url: str | None
    redoc_url: str | None
    openapi_url: str | None


def docs_urls(is_development: bool) -> DocsUrls:
    """The interactive API docs are a development aid; production doesn't publish its schema."""
    if is_development:
        return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
    return {"docs_url": None, "redoc_url": None, "openapi_url": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        removed = remove_unfinished_documents(db)
    if removed:
        logger.info("removed unfinished documents from an older version", extra={"count": removed})
    yield


app = FastAPI(
    title="Fovea API",
    description="RSVP speed reading for PDFs.",
    version="0.1.0",
    lifespan=lifespan,
    **docs_urls(settings.is_development),
)

# Added first so it sits inside the request logger, which then records its 413s.
app.add_middleware(UploadSizeLimit, path="/upload")
app.middleware("http")(log_requests)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Requests carry a bearer token, not cookies, so credentialed CORS isn't needed.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(progress.router)
app.include_router(analytics.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "default_wpm": settings.default_wpm,
    }
