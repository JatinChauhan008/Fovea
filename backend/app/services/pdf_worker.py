"""
Extracts a PDF's words in a child process and writes them to disk.

Run as `python -m app.services.pdf_worker <pdf_path> <tokens_path>`. On success it
writes the word file and prints one JSON line: page count, word count and the PDF's
own title (may be empty). When the PDF can't be used (no text, password, unreadable)
it prints {"error": "<message for the reader>"} and exits with USER_ERROR_EXIT, with
the underlying cause on stderr. Anything else crashes with a non-zero exit.

Running in its own process lets the server stop a PDF that hangs or crashes the
PDF library without taking the server down with it.
"""

import json
import sys
from pathlib import Path

from app.services.pdf_service import PdfExtractionError, process_pdf, write_tokens

USER_ERROR_EXIT = 2


def main(pdf_path: str, tokens_path: str) -> int:
    try:
        tokens, info = process_pdf(Path(pdf_path))
    except PdfExtractionError as exc:
        print(json.dumps({"error": str(exc)}))
        if exc.__cause__ is not None:
            print(repr(exc.__cause__), file=sys.stderr)
        return USER_ERROR_EXIT

    write_tokens(tokens, Path(tokens_path))
    title = (info["metadata"].get("title") or "").strip()
    print(json.dumps({"page_count": info["page_count"], "word_count": len(tokens), "title": title}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
