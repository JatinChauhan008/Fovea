"""Small helpers for the files a document keeps on disk (its PDF and its extracted words)."""

from pathlib import Path


def remove_files(*paths: str | Path) -> None:
    """Delete each file if it exists; a file that is already gone is not an error."""
    for path in paths:
        Path(path).unlink(missing_ok=True)
