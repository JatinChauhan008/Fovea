import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.routers import analytics, auth, documents, progress
from app.services.cleanup import remove_unfinished_documents

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        removed = remove_unfinished_documents(db)
    if removed:
        logger.info("removed %d unfinished documents left by an older version", removed)
    yield


app = FastAPI(
    title="Fovea API",
    description="RSVP speed reading for PDFs.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
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
