"""
PDF handling with PyMuPDF and the word files made from it.

- process_pdf: a PDF's pages turned into words (via the tokenizer), or
  PdfExtractionError with a message fit to show the reader.
- write_tokens / read_tokens: save a document's words as JSON; read them back
  through a small cache keyed on the file's size and modified time.
- guess_title: the PDF's own title if it has a real one, else the file name.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pymupdf

from app.services.tokenizer import Token, tokenize_pages

UNREADABLE_PDF = "This file couldn't be read as a PDF."


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
        raise PdfExtractionError(UNREADABLE_PDF) from exc

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


# A parsed word costs ~280 bytes, so a 500k-word textbook is ~140 MB; two is plenty
# for one reader streaming a book while another document is opened.
_CACHED_DOCUMENTS = 2


def read_tokens(path: Path) -> list[dict]:
    """
    A document's words, parsed from its word file. The reader streams a book in many
    chunks, so the parsed list is cached (keyed on the file's path, size and modified
    time, so a changed file is read again). Callers must not modify the returned list.
    Raises FileNotFoundError if the file is gone.
    """
    stat = Path(path).stat()
    return _parse_tokens(str(path), stat.st_mtime_ns, stat.st_size)


def clear_token_cache() -> None:
    """Forget every parsed word file (used by tests)."""
    _parse_tokens.cache_clear()


@lru_cache(maxsize=_CACHED_DOCUMENTS)
def _parse_tokens(path: str, _mtime_ns: int, _size: int) -> list[dict]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def guess_title(pdf_title: str, filename: str) -> str:
    """The PDF's own title if it has a real one, otherwise a tidied-up file name."""
    title = pdf_title.strip()
    if len(title) > 3:
        return title[:200]
    return Path(filename).stem.replace("_", " ").replace("-", " ").strip()[:200] or "Untitled"
