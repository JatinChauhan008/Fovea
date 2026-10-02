"""
Extracts a stored PDF's words, with a time limit, by running the PDF worker in a
child process (see pdf_worker.py).

Returns the page count, word count and the PDF's own title once the word file has
been written (the worker's answer is the last line it prints). Raises
PdfExtractionError, with a message fit to show the reader,
when the PDF can't be used or runs past `timeout_seconds` (the child is killed).
A worker that crashes outright is logged with its error output and reported to
the reader as an unreadable PDF too: an unhandled server error would reach the
browser without CORS headers and look like the server being down. Only two
extractions run at a time.
"""

import json
import logging
import os
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from app.config import BASE_DIR
from app.services.pdf_service import UNREADABLE_PDF, PdfExtractionError
from app.services.pdf_worker import USER_ERROR_EXIT

logger = logging.getLogger(__name__)

# How much of the worker's error output to keep in a log line.
_STDERR_TAIL = 2000
# At most this many PDFs are read at once; further uploads wait their turn, so a burst
# of uploads can't start dozens of extraction processes.
_running_extractions = threading.BoundedSemaphore(2)


@dataclass(frozen=True)
class ExtractedPdf:
    page_count: int
    word_count: int
    title: str


def extract_pdf(pdf_path: Path, tokens_path: Path, timeout_seconds: float) -> ExtractedPdf:
    # Full paths, because the child runs from the backend folder, not the server's.
    command = [
        sys.executable,
        "-m",
        "app.services.pdf_worker",
        str(pdf_path.resolve()),
        str(tokens_path.resolve()),
    ]
    try:
        with _running_extractions:
            result = subprocess.run(
                command,
                cwd=BASE_DIR,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                timeout=timeout_seconds,
            )
    except subprocess.TimeoutExpired as exc:
        logger.warning("pdf extraction timed out", extra={"timeout_seconds": timeout_seconds})
        raise PdfExtractionError(
            "This PDF took too long to read. Try a smaller or simpler file."
        ) from exc

    if result.returncode == USER_ERROR_EXIT:
        logger.info("pdf rejected", extra={"cause": result.stderr.strip()[-_STDERR_TAIL:]})
        raise PdfExtractionError(_last_json_line(result.stdout)["error"])
    if result.returncode != 0:
        logger.error(
            "pdf worker crashed",
            extra={"exit_code": result.returncode, "stderr": result.stderr[-_STDERR_TAIL:]},
        )
        raise PdfExtractionError(UNREADABLE_PDF)

    return ExtractedPdf(**_last_json_line(result.stdout))


def _last_json_line(output: str) -> dict:
    # The worker's answer is its last line; the PDF library may print notices before it.
    return json.loads(output.strip().splitlines()[-1])
