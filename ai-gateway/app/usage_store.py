"""Persistent usage log — every chat / embed / structured / summarize / moderate
call is recorded so you can bill, quota, debug, and report on it.

Default backend: SQLite via ``aiosqlite`` (one file, no extra services).
If ``USAGE_DB_PATH`` is empty the store is a no-op (existing behaviour, useful
for tests). The same module is used by ``GET /v1/usage`` and by the per-user
daily-token quota check.

Schema:
    usage_log(
        id            INTEGER PRIMARY KEY,
        ts            TEXT NOT NULL,            -- ISO8601 UTC
        user_id       TEXT NOT NULL,
        endpoint      TEXT NOT NULL,            -- /v1/chat, /v1/embeddings, ...
        provider      TEXT,                     -- openrouter / groq / ollama
        model         TEXT,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens  INTEGER DEFAULT 0,
        latency_ms    INTEGER DEFAULT 0,
        status        TEXT NOT NULL,            -- ok / error
        error         TEXT
    )
    CREATE INDEX idx_usage_user_ts ON usage_log(user_id, ts)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from .config import Settings

log = logging.getLogger("ai-gateway")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_log (
    id               INTEGER PRIMARY KEY,
    ts               TEXT NOT NULL,
    user_id          TEXT NOT NULL,
    endpoint         TEXT NOT NULL,
    provider         TEXT,
    model            TEXT,
    prompt_tokens    INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens     INTEGER DEFAULT 0,
    latency_ms       INTEGER DEFAULT 0,
    status           TEXT NOT NULL,
    error            TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage_log(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_usage_endpoint_ts ON usage_log(endpoint, ts);
"""


class UsageStore:
    """Async wrapper around a single aiosqlite connection.

    ``record(...)`` is fire-and-forget: it schedules the write on the event loop
    and never blocks the request path. Reads (``get_usage``, ``daily_tokens``)
    await the connection directly.
    """

    def __init__(self, db_path: str) -> None:
        try:
            import aiosqlite  # lazy: keeps aiosqlite optional at install time
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "USAGE_DB_PATH is set but `aiosqlite` is not installed. "
                "Add `aiosqlite>=0.20` to requirements.txt."
            ) from exc
        self._db_path = db_path
        self._aiosqlite = aiosqlite
        self._db: Any = None
        self._lock = asyncio.Lock()

    async def _connect(self) -> None:
        async with self._lock:
            if self._db is not None:
                return
            self._db = await self._aiosqlite.connect(self._db_path)
            await self._db.executescript(_SCHEMA)
            await self._db.commit()
            log.info("usage store: SQLite at %s", self._db_path)

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    async def record(
        self,
        *,
        user_id: str | None,
        endpoint: str,
        provider: str | None,
        model: str | None,
        usage: dict[str, int] | None,
        latency_ms: int,
        status: str = "ok",
        error: str | None = None,
    ) -> None:
        """Schedule an insert; failures are logged, never raised."""
        await self._connect()
        u = usage or {}
        row = (
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
            user_id or "anonymous",
            endpoint,
            provider,
            model,
            int(u.get("prompt_tokens", 0)),
            int(u.get("completion_tokens", 0)),
            int(u.get("total_tokens", 0)),
            latency_ms,
            status,
            (error or "")[:500],
        )
        try:
            await self._db.execute(
                """INSERT INTO usage_log
                   (ts, user_id, endpoint, provider, model,
                    prompt_tokens, completion_tokens, total_tokens,
                    latency_ms, status, error)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                row,
            )
            await self._db.commit()
        except Exception as exc:  # pragma: no cover
            log.error("usage insert failed: %s", exc)

    async def daily_tokens(self, user_id: str | None) -> int:
        """Sum total_tokens for this user in the last 24h."""
        await self._connect()
        key = user_id or "anonymous"
        async with self._db.execute(
            """SELECT COALESCE(SUM(total_tokens), 0) FROM usage_log
               WHERE user_id = ? AND ts >= ?""",
            (key, _iso_hours_ago(24)),
        ) as cur:
            row = await cur.fetchone()
            return int(row[0]) if row else 0

    async def get_usage(
        self,
        *,
        user_id: str | None,
        since: str | None = None,
        until: str | None = None,
        limit: int = 1000,
    ) -> dict[str, Any]:
        """Aggregate usage stats for a user (or all users if user_id is None)."""
        await self._connect()
        where, params = [], []
        if user_id:
            where.append("user_id = ?")
            params.append(user_id)
        if since:
            where.append("ts >= ?")
            params.append(since)
        if until:
            where.append("ts <= ?")
            params.append(until)
        clause = ("WHERE " + " AND ".join(where)) if where else ""

        async with self._db.execute(
            f"SELECT COUNT(*), COALESCE(SUM(total_tokens),0), "
            f"COALESCE(SUM(prompt_tokens),0), "
            f"COALESCE(SUM(completion_tokens),0) FROM usage_log {clause}",
            params,
        ) as cur:
            totals = await cur.fetchone()

        async with self._db.execute(
            f"SELECT endpoint, COUNT(*), SUM(total_tokens) FROM usage_log "
            f"{clause} GROUP BY endpoint",
            params,
        ) as cur:
            by_endpoint = [
                {"endpoint": r[0], "calls": r[1], "total_tokens": int(r[2] or 0)}
                async for r in cur
            ]
        async with self._db.execute(
            f"SELECT provider, COUNT(*), SUM(total_tokens) FROM usage_log "
            f"{clause} GROUP BY provider",
            params,
        ) as cur:
            by_provider = [
                {"provider": r[0], "calls": r[1], "total_tokens": int(r[2] or 0)}
                async for r in cur
            ]
        async with self._db.execute(
            f"SELECT ts, endpoint, provider, model, total_tokens, latency_ms, "
            f"status, error FROM usage_log {clause} "
            f"ORDER BY id DESC LIMIT ?",
            [*params, limit],
        ) as cur:
            recent = [
                {
                    "ts": r[0],
                    "endpoint": r[1],
                    "provider": r[2],
                    "model": r[3],
                    "total_tokens": r[4],
                    "latency_ms": r[5],
                    "status": r[6],
                    "error": r[7],
                }
                async for r in cur
            ]
        return {
            "user_id": user_id,
            "calls": totals[0],
            "total_tokens": int(totals[1] or 0),
            "prompt_tokens": int(totals[2] or 0),
            "completion_tokens": int(totals[3] or 0),
            "by_endpoint": by_endpoint,
            "by_provider": by_provider,
            "recent": recent,
        }


def _iso_hours_ago(hours: int) -> str:
    from datetime import timedelta

    return (
        datetime.now(timezone.utc) - timedelta(hours=hours)
    ).isoformat(timespec="seconds")


# Module-level singleton.
_store: UsageStore | None = None
_none_marker = object()


def get_usage_store(settings: Settings) -> UsageStore | None:
    """Return the configured store, or None if persistence is disabled."""
    global _store
    if _store is _none_marker:
        return None
    if _store is not None:
        return _store
    if not settings.usage_db_path:
        _store = _none_marker  # type: ignore[assignment]
        return None
    try:
        _store = UsageStore(settings.usage_db_path)
    except Exception as exc:  # pragma: no cover
        log.warning("could not init usage store (%s); persistence disabled", exc)
        _store = _none_marker  # type: ignore[assignment]
        return None
    return _store


def reset_for_tests() -> None:
    global _store
    _store = None
