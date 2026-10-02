"""Reading a document's words: parsed once, re-read only when the file changes."""

import json
import os

from app.services import pdf_service
from app.services.pdf_service import clear_token_cache, read_tokens


def test_streaming_a_document_parses_its_word_file_once(tmp_path, monkeypatch):
    path = tmp_path / "doc.tokens.json"
    path.write_text(json.dumps([{"t": "one", "o": 1, "m": 1.0, "p": 1}]))
    parses = []
    real_loads = json.loads
    monkeypatch.setattr(pdf_service.json, "loads", lambda s: parses.append(1) or real_loads(s))
    clear_token_cache()

    for _ in range(5):
        assert read_tokens(path)[0]["t"] == "one"

    assert len(parses) == 1


def test_a_changed_word_file_is_read_again(tmp_path):
    path = tmp_path / "doc.tokens.json"
    path.write_text(json.dumps([{"t": "one", "o": 1, "m": 1.0, "p": 1}]))
    clear_token_cache()
    assert read_tokens(path)[0]["t"] == "one"

    path.write_text(json.dumps([{"t": "two", "o": 1, "m": 1.0, "p": 1}]))
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))

    assert read_tokens(path)[0]["t"] == "two"
