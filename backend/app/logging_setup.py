"""
JSON logging for the whole backend: one JSON object per line, with the time, level,
logger and message plus any fields passed through `extra=`. `configure_logging` sets it
up once at startup; `log_requests` is the middleware that logs every request.
"""

import json
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from fastapi import Request, Response

_STANDARD_FIELDS = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {
    "message",
    "asctime",
    "taskName",
}

request_logger = logging.getLogger("app.requests")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        line.update({k: v for k, v in vars(record).items() if k not in _STANDARD_FIELDS})
        if record.exc_info:
            line["error"] = self.formatException(record.exc_info)
        return json.dumps(line, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # The server's own loggers write through the same JSON handler. Its access log is
    # off because `log_requests` already records every request.
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
    logging.getLogger("uvicorn.access").disabled = True


async def log_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Log each request's method, path, status and duration (never its headers or body)."""
    started = time.perf_counter()
    fields = {"method": request.method, "path": request.url.path}
    try:
        response = await call_next(request)
    except Exception:
        request_logger.exception("request failed", extra=fields)
        raise
    duration_ms = round((time.perf_counter() - started) * 1000, 1)
    request_logger.info(
        "request", extra={**fields, "status": response.status_code, "duration_ms": duration_ms}
    )
    return response
