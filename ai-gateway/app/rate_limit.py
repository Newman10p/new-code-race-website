"""Pluggable rate limiter — Redis when configured, in-memory otherwise.

Both backends implement the same interface: a sliding 60-second window with a
per-user request cap. Redis uses ZSET (ZADD + ZREMRANGEBYSCORE + ZCARD) so the
check is atomic across multiple gateway instances; in-memory uses a deque and
only works for a single process.

Use ``get_rate_limiter(settings)`` to obtain whichever backend is appropriate
for the current configuration; pass ``user_id`` (not the request object) so the
limiter works for every endpoint shape.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from typing import Protocol

from .config import Settings

log = logging.getLogger("ai-gateway")

_WINDOW_SECONDS = 60


class RateLimitBackend(Protocol):
    """Sliding-window counter keyed by ``user_id`` (or 'anonymous')."""

    def check(self, user_id: str | None, limit: int) -> None:  # pragma: no cover
        ...


class InMemoryLimiter:
    """Single-process sliding window. Resets on restart. Default in dev."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, user_id: str | None, limit: int) -> None:
        key = user_id or "anonymous"
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > _WINDOW_SECONDS:
            q.popleft()
        if len(q) >= limit:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded, slow down.",
            )
        q.append(now)


class RedisLimiter:
    """Multi-instance sliding window via a Redis sorted set.

    ZADD member=unique-id score=now  -> ZREMRANGEBYSCORE old  -> ZCARD  -> EXPIRE
    Run as a pipeline so the operations are batched to Redis in one round trip.
    """

    def __init__(self, redis_url: str) -> None:
        try:
            import redis  # lazy import: keeps `redis` optional at install time
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "REDIS_URL is set but the `redis` package is not installed. "
                "Add `redis>=5.0` to requirements.txt."
            ) from exc
        self._client = redis.Redis.from_url(
            redis_url, decode_responses=True, socket_timeout=2
        )
        self._url = redis_url
        log.info("rate limiter: Redis backend (%s)", _mask_url(redis_url))

    def check(self, user_id: str | None, limit: int) -> None:
        key = f"rate:{user_id or 'anonymous'}"
        now_ms = int(time.time() * 1000)
        member = f"{now_ms}:{uuid.uuid4().hex}"
        pipe = self._client.pipeline()
        pipe.zadd(key, {member: now_ms})
        pipe.zremrangebyscore(key, 0, now_ms - _WINDOW_SECONDS * 1000)
        pipe.zcard(key)
        pipe.expire(key, _WINDOW_SECONDS)
        try:
            _added, _removed, count, _ttl = pipe.execute()
        except Exception as exc:  # pragma: no cover
            log.error("redis rate-limit check failed: %s — falling open", exc)
            return  # fail OPEN: never block on infra outage
        if count > limit:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded, slow down.",
            )


def _mask_url(url: str) -> str:
    """Hide password if present, for log lines."""
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        if ":" in rest.split("@", 1)[0]:
            creds, host = rest.split("@", 1)
            user = creds.split(":", 1)[0]
            return f"{scheme}://{user}:***@{host}"
    return url


# Module-level singleton; chosen once on first call from settings.
_limiter: RateLimitBackend | None = None


def get_rate_limiter(settings: Settings) -> RateLimitBackend:
    """Return the configured limiter, building it once on first use."""
    global _limiter
    if _limiter is not None:
        return _limiter
    if settings.redis_url:
        try:
            _limiter = RedisLimiter(settings.redis_url)
        except Exception as exc:  # pragma: no cover
            log.warning(
                "could not init Redis limiter (%s); using in-memory", exc
            )
            _limiter = InMemoryLimiter()
    else:
        _limiter = InMemoryLimiter()
    return _limiter


def reset_for_tests() -> None:
    """Drop the cached limiter so a new REDIS_URL is honoured (tests only)."""
    global _limiter
    _limiter = None
