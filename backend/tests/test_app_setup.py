"""App-level setup: API docs exposure and the JSON log format."""

import json
import logging

from app.logging_setup import JsonFormatter
from app.main import docs_urls


def test_api_docs_are_only_served_in_development():
    assert docs_urls(is_development=True)["docs_url"] == "/docs"
    assert docs_urls(is_development=False) == {
        "docs_url": None,
        "redoc_url": None,
        "openapi_url": None,
    }


def test_log_lines_are_json_with_their_fields():
    record = logging.LogRecord("app.test", logging.INFO, __file__, 1, "upload done", None, None)
    record.user_id = 7
    record.words = 1200

    line = json.loads(JsonFormatter().format(record))

    assert line["message"] == "upload done"
    assert line["level"] == "INFO"
    assert line["logger"] == "app.test"
    assert line["user_id"] == 7
    assert line["words"] == 1200
