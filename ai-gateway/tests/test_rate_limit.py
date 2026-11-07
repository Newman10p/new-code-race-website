"""Tests for the rate limiter backends and the daily quota enforcement.

These run without a real Redis (RedisLimiter is exercised via a fakeredis
stand-in; the in-memory backend is exercised directly).
"""
from __future__ import annotations

import os

# Configure env BEFORE importing the app, same pattern as test_gateway.py.
os.environ.update(
    INTERNAL_API_TOKEN="test-token",
    OPENROUTER_API_KEY="fake-key",
    AI_DEFAULT_PROVIDER="openrouter",
    AI_RATE_LIMIT_PER_MINUTE="3",  # tiny so we can hit it
)

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import rate_limit as rl_mod
from app import usage_store as us_mod
from app.config import Settings
from app.main import app, enforce_daily_quota

client = TestClient(app)
HDRS = {"X-Internal-Token": "test-token"}


# ---------- InMemoryLimiter (tested directly with explicit limit) ----------


def _mem_limiter():
    rl_mod.reset_for_tests()
    return rl_mod.InMemoryLimiter()


def test_in_memory_limiter_allows_under_cap():
    lim = _mem_limiter()
    lim.check("u-1", limit=3)
    lim.check("u-1", limit=3)
    lim.check("u-1", limit=3)  # exactly at cap, should still pass


def test_in_memory_limiter_blocks_over_cap():
    lim = _mem_limiter()
    lim.check("u-2", limit=3)
    lim.check("u-2", limit=3)
    lim.check("u-2", limit=3)
    with pytest.raises(HTTPException) as exc:
        lim.check("u-2", limit=3)
    assert exc.value.status_code == 429


def test_in_memory_limiter_keys_per_user():
    lim = _mem_limiter()
    # burn u-3's full budget; u-4 should be unaffected
    lim.check("u-3", limit=3)
    lim.check("u-3", limit=3)
    lim.check("u-3", limit=3)
    lim.check("u-4", limit=3)  # different user, no problem


def test_anonymous_key_used_when_user_id_is_none():
    lim = _mem_limiter()
    lim.check(None, limit=3)
    lim.check(None, limit=3)
    lim.check(None, limit=3)
    with pytest.raises(HTTPException):
        lim.check(None, limit=3)


# ---------- RedisLimiter via fakeredis (only if installed) ----------


def _fakeredis():
    """Return a connected fakeredis client or skip the test."""
    pytest.importorskip("fakeredis")
    import fakeredis

    return fakeredis.FakeRedis(decode_responses=True)


def test_redis_limiter_blocks_over_cap(monkeypatch):
    fake = _fakeredis()

    # Monkey-patch Redis.from_url so RedisLimiter uses our fake client.
    import redis

    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(lambda *a, **kw: fake))

    rl_mod.reset_for_tests()
    s = Settings(redis_url="redis://localhost:6379/0", rate_limit_per_minute=2)
    limiter = rl_mod.get_rate_limiter(s)
    assert isinstance(limiter, rl_mod.RedisLimiter)

    limiter.check("user-a", limit=2)
    limiter.check("user-a", limit=2)
    with pytest.raises(HTTPException) as exc:
        limiter.check("user-a", limit=2)
    assert exc.value.status_code == 429


def test_redis_limiter_separates_users(monkeypatch):
    fake = _fakeredis()
    import redis

    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(lambda *a, **kw: fake))

    rl_mod.reset_for_tests()
    s = Settings(redis_url="redis://localhost:6379/0", rate_limit_per_minute=1)
    limiter = rl_mod.get_rate_limiter(s)

    limiter.check("alice", limit=1)
    # alice's budget is exhausted; bob is a separate key
    with pytest.raises(HTTPException):
        limiter.check("alice", limit=1)
    limiter.check("bob", limit=1)  # should not raise


# ---------- daily quota enforcement ----------


def test_daily_quota_disabled_by_default():
    """AI_DAILY_TOKEN_LIMIT_PER_USER=0 (default) -> quota is a no-op."""
    rl_mod.reset_for_tests()
    us_mod.reset_for_tests()
    # No usage_db_path either, so even with a limit set it'd be a no-op.
    asyncio.run(enforce_daily_quota("anyone"))  # must not raise


def test_daily_quota_blocks_when_exhausted(tmp_path, monkeypatch):
    pytest.importorskip("aiosqlite")
    db = tmp_path / "u.db"
    monkeypatch.setenv("USAGE_DB_PATH", str(db))
    monkeypatch.setenv("AI_DAILY_TOKEN_LIMIT_PER_USER", "100")
    # Reload settings so the new env vars take effect.
    from app import config as cfg

    monkeypatch.setattr(cfg, "get_settings", lambda: Settings(
        usage_db_path=str(db), daily_token_limit_per_user=100,
    ))
    us_mod.reset_for_tests()
    rl_mod.reset_for_tests()

    # Patch get_usage_store + get_settings in main to use our test settings.
    from app import main as app_main

    test_settings = Settings(usage_db_path=str(db), daily_token_limit_per_user=100)
    monkeypatch.setattr(app_main, "get_settings", lambda: test_settings)

    store = us_mod.get_usage_store(test_settings)
    assert store is not None

    async def seed():
        # Record 110 tokens for user "u-quota" — already over the 100 budget.
        await store.record(
            user_id="u-quota", endpoint="/v1/chat", provider="openrouter",
            model="m", usage={"total_tokens": 110, "prompt_tokens": 80,
                              "completion_tokens": 30},
            latency_ms=10,
        )

    asyncio.run(seed())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(enforce_daily_quota("u-quota"))
    assert exc.value.status_code == 429
    assert "100" in exc.value.detail

    # Cleanup
    asyncio.run(store.close())
