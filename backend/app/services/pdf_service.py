"""PDF text extraction via PyMuPDF."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf

from app.services.tokenizer import Token, tokenize_pages


class PdfExtractionError(RuntimeError):
    pass


def extract_pages(path: Path) -> tuple[list[str], dict]:
    """Return (page texts, document metadata)."""
    try:
        with pymupdf.open(path) as doc:
            if doc.is_encrypted and not doc.authenticate(""):
                raise PdfExtractionError("This PDF is password protected.")
            pages = [page.get_text("text") for page in doc]
            meta = dict(doc.metadata or {})
    except PdfExtractionError:
        raise
    except Exception as exc:
        # The library's own message means nothing to a reader; the cause stays attached
        # for the log.
        raise PdfExtractionError("This file couldn't be read as a PDF.") from exc

    return pages, meta


def process_pdf(path: Path) -> tuple[list[Token], dict]:
    pages, meta = extract_pages(path)
    tokens = tokenize_pages(pages)

    if not tokens:
        raise PdfExtractionError(
            "No selectable text found. This looks like a scanned PDF - it needs OCR first."
        )

    return tokens, {"page_count": len(pages), "metadata": meta}


def write_tokens(tokens: list[Token], destination: Path) -> None:
    payload = [tok.as_dict() for tok in tokens]
    destination.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def read_tokens(path: Path) -> list[dict]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def guess_title(meta: dict, filename: str) -> str:
    title = (meta.get("title") or "").strip()
    if title and len(title) > 3:
        return title[:200]
    return Path(filename).stem.replace("_", " ").replace("-", " ").strip()[:200] or "Untitled"
