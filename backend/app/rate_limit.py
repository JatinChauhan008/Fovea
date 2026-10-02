"""
Counts recent attempts per key and says when a caller must wait.

A sliding window kept in memory: each key remembers the times of its recent
attempts, and once it has `limit` of them inside `window_seconds`, `hit` returns
how many seconds remain until the oldest one ages out. State lives in this
process only, which suits Fovea's single-server setup; behind a proxy the client
address is the proxy's unless the server is run with forwarded-header support.
"""

import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.config import get_settings

logger = logging.getLogger(__name__)

# Above this many tracked keys, keys with no recent attempts are dropped.
_PRUNE_ABOVE = 10_000


class RateLimiter:
    def __init__(
        self, limit: int, window_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.limit = limit
        self.window = window_seconds
        self._clock = clock
        self._attempts: dict[str, deque[float]] = {}
        # Sign-in requests run on several worker threads at once.
        self._lock = threading.Lock()

    def hit(self, key: str) -> float | None:
        """Record an attempt. Returns None if allowed, or the seconds to wait if not."""
        with self._lock:
            return self._hit(key)

    def _hit(self, key: str) -> float | None:
        now = self._clock()
        attempts = self._attempts.setdefault(key, deque())
        while attempts and attempts[0] <= now - self.window:
            attempts.popleft()
        if len(attempts) >= self.limit:
            return attempts[0] + self.window - now
        attempts.append(now)
        if len(self._attempts) > _PRUNE_ABOVE:
            self._prune(now)
        return None

    def reset(self) -> None:
        with self._lock:
            self._attempts.clear()

    def _prune(self, now: float) -> None:
        stale = [k for k, a in self._attempts.items() if not a or a[-1] <= now - self.window]
        for key in stale:
            del self._attempts[key]


_settings = get_settings()
login_limiter = RateLimiter(_settings.login_attempts, _settings.login_window_seconds)
signup_limiter = RateLimiter(_settings.signup_attempts, _settings.signup_window_seconds)


def client_address(request: Request) -> str:
    """The caller's network address (a proxy's, unless forwarded headers are trusted)."""
    return request.client.host if request.client else "unknown"


def login_attempt_key(request: Request, email: str) -> str:
    """Sign-in attempts are counted per address and email, so guessing one account
    doesn't lock out other people signing in from the same network."""
    return f"{client_address(request)}:{email.lower()}"


def enforce_rate_limit(limiter: RateLimiter, key: str, label: str) -> None:
    """Count an attempt against `key`; raise a 429 with Retry-After once it is over the limit."""
    wait = limiter.hit(key)
    if wait is None:
        return
    seconds = max(1, math.ceil(wait))
    logger.warning("rate limit hit", extra={"limit": label, "retry_after": seconds})
    minutes = math.ceil(seconds / 60)
    unit = "minute" if minutes == 1 else "minutes"
    raise HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Too many attempts. Try again in {minutes} {unit}.",
        headers={"Retry-After": str(seconds)},
    )
