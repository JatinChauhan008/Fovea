"""
Refuses upload bodies over the size limit before the app reads them.

ASGI middleware for one path. A declared Content-Length over the limit gets a 413
straight away. A body sent without one is counted as it arrives, and the request is
stopped with a 413 as soon as it passes the limit, so an oversized upload never
reaches the disk in full. The limit is the upload limit plus room for the multipart
wrapping, read from settings on each request.
"""

import json
from typing import Any

from app.config import MB, get_settings

# Multipart boundaries and part headers around the file itself.
MULTIPART_ALLOWANCE = 64 * 1024


class _BodyTooLarge(Exception):
    pass


class UploadSizeLimit:
    def __init__(self, app: Any, path: str) -> None:
        self.app = app
        self.path = path

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["path"] != self.path or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return

        settings = get_settings()
        limit = int(settings.max_upload_mb * MB) + MULTIPART_ALLOWANCE
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await _refuse(send, settings.max_upload_mb)
            return

        received = 0
        over_limit = False
        response_started = False

        async def counting_receive() -> dict:
            nonlocal received, over_limit
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    over_limit = True
                    raise _BodyTooLarge
            return message

        async def guarded_send(message: dict) -> None:
            nonlocal response_started
            # Whatever the app makes of the cut-off body, the reader is told it was too big.
            if over_limit:
                if not response_started:
                    response_started = True
                    await _refuse(send, settings.max_upload_mb)
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _BodyTooLarge:
            if not response_started:
                await _refuse(send, settings.max_upload_mb)


async def _refuse(send: Any, max_upload_mb: float) -> None:
    body = json.dumps({"detail": f"That file is too big. The limit is {max_upload_mb:g} MB."})
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": body.encode()})
