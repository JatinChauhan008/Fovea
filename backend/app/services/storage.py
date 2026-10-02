"""Helpers for the files a document keeps on disk: its PDF and its extracted words."""

from pathlib import Path
from typing import BinaryIO

_COPY_CHUNK = 1024 * 1024
_PDF_SIGNATURE = b"%PDF"


class UploadTooLarge(Exception):
    """The upload passed the size limit; nothing was left on disk."""


def remove_files(*paths: str | Path) -> None:
    """Delete each file if it exists; a file that is already gone is not an error."""
    for path in paths:
        Path(path).unlink(missing_ok=True)


def save_upload(source: BinaryIO, destination: Path, max_bytes: int) -> int:
    """
    Copy an uploaded file to disk a chunk at a time and return its size, so a large
    upload is never held in memory. Stops and deletes the partial file once it passes
    `max_bytes`, raising UploadTooLarge.
    """
    written = 0
    with destination.open("wb") as out:
        while chunk := source.read(_COPY_CHUNK):
            written += len(chunk)
            if written > max_bytes:
                break
            out.write(chunk)
    if written > max_bytes:
        remove_files(destination)
        raise UploadTooLarge
    return written


def starts_like_pdf(path: Path) -> bool:
    """True if the file begins with the bytes every PDF starts with."""
    with path.open("rb") as handle:
        return handle.read(len(_PDF_SIGNATURE)) == _PDF_SIGNATURE


def storage_used_bytes(folder: Path) -> int:
    """Total size of the files directly inside a reader's storage folder."""
    if not folder.exists():
        return 0
    return sum(entry.stat().st_size for entry in folder.iterdir() if entry.is_file())
