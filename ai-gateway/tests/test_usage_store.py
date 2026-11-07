"""Tests for the SQLite usage store and the GET /v1/usage endpoint."""
from __future__ import annotations

import asyncio
import os

# Configure env BEFORE importing the app.
os.environ.update(
    INTERNAL_API_TOKEN="test-token",
    OPENROUTER_API_KEY="fake-key",
    AI_DEFAULT_PROVIDER="openrouter",
)

import pytest
from fastapi.testclient import TestClient

from app import usage_store as us_mod
from app.config import Settings
from app.main import app

client = TestClient(app)
HDRS = {"X-Internal-Token": "test-token"}


def _fresh_store(tmp_path, monkeypatch):
    """Build a UsageStore pointed at a temp DB and clear the singleton cache."""
    pytest.importorskip("aiosqlite")
    db = tmp_path / "usage.db"
    us_mod.reset_for_tests()
    s = Settings(usage_db_path=str(db))
    store = us_mod.get_usage_store(s)
    assert store is not None
    # Patch main.get_settings to return this one.
    from app import main as app_main

    monkeypatch.setattr(app_main, "get_settings", lambda: s)
    return store, s


def test_get_usage_store_disabled_when_no_path(monkeypatch):
    us_mod.reset_for_tests()
    s = Settings(usage_db_path="")
    assert us_mod.get_usage_store(s) is None


def test_usage_record_and_aggregate(tmp_path, monkeypatch):
    store, s = _fresh_store(tmp_path, monkeypatch)

    async def go():
        await store.record(
            user_id="u-1", endpoint="/v1/chat", provider="openrouter",
            model="llama", usage={"prompt_tokens": 10, "completion_tokens": 5,
                                   "total_tokens": 15},
            latency_ms=120,
        )
        await store.record(
            user_id="u-1", endpoint="/v1/chat", provider="groq",
            model="llama", usage={"prompt_tokens": 8, "completion_tokens": 4,
                                   "total_tokens": 12},
            latency_ms=80,
        )
        await store.record(
            user_id="u-1", endpoint="/v1/embeddings", provider="openrouter",
            model="baichuan", usage={"prompt_tokens": 4, "completion_tokens": 0,
                                      "total_tokens": 4},
            latency_ms=40,
        )
        # An error row should also be persisted.
        await store.record(
            user_id="u-1", endpoint="/v1/chat", provider=None, model=None,
            usage=None, latency_ms=20, status="error",
            error="all providers failed",
        )

    asyncio.run(go())

    agg = asyncio.run(store.get_usage(user_id="u-1"))
    assert agg["calls"] == 4
    assert agg["total_tokens"] == 15 + 12 + 4  # error row adds 0
    assert agg["prompt_tokens"] == 10 + 8 + 4
    assert agg["completion_tokens"] == 5 + 4
    endpoints = {e["endpoint"]: e for e in agg["by_endpoint"]}
    assert endpoints["/v1/chat"]["calls"] == 3  # 2 ok + 1 error
    assert endpoints["/v1/embeddings"]["calls"] == 1
    providers = {p["provider"]: p for p in agg["by_provider"]}
    assert providers["openrouter"]["total_tokens"] == 15 + 4
    assert providers["groq"]["total_tokens"] == 12
    assert len(agg["recent"]) == 4
    # Most recent first.
    assert agg["recent"][0]["endpoint"] == "/v1/chat"
    assert agg["recent"][0]["status"] == "error"

    asyncio.run(store.close())


def test_daily_tokens_24h_window(tmp_path, monkeypatch):
    store, s = _fresh_store(tmp_path, monkeypatch)

    async def go():
        await store.record(
            user_id="u-2", endpoint="/v1/chat", provider="openrouter",
            model="m", usage={"total_tokens": 50, "prompt_tokens": 30,
                              "completion_tokens": 20},
            latency_ms=10,
        )
        # Total within 24h.
        return await store.daily_tokens("u-2")

    used = asyncio.run(go())
    assert used == 50

    # A different user has 0.
    assert asyncio.run(store.daily_tokens("u-other")) == 0

    asyncio.run(store.close())


def test_usage_endpoint_returns_503_when_disabled():
    """Without USAGE_DB_PATH the endpoint should clearly refuse."""
    us_mod.reset_for_tests()
    # Force the singleton to the disabled state.
    from app.config import get_settings

    # Use a settings object with no usage_db_path
    s = Settings(usage_db_path="")
    from app import main as app_main

    app_main.get_settings = lambda: s  # type: ignore[assignment]
    try:
        r = client.get("/v1/usage", headers=HDRS, params={"user_id": "x"})
        assert r.status_code == 503
        assert "USAGE_DB_PATH" in r.json()["detail"]
    finally:
        # Restore.
        app_main.get_settings = get_settings  # type: ignore[assignment]


def test_usage_endpoint_returns_aggregates(tmp_path, monkeypatch):
    store, s = _fresh_store(tmp_path, monkeypatch)

    async def seed():
        await store.record(
            user_id="u-ep", endpoint="/v1/chat", provider="openrouter",
            model="llama", usage={"total_tokens": 7, "prompt_tokens": 4,
                                    "completion_tokens": 3},
            latency_ms=15,
        )

    asyncio.run(seed())

    r = client.get("/v1/usage", headers=HDRS, params={"user_id": "u-ep"})
    assert r.status_code == 200
    body = r.json()
    assert body["calls"] == 1
    assert body["total_tokens"] == 7
    assert body["by_endpoint"][0]["endpoint"] == "/v1/chat"

    # Auth required.
    assert client.get("/v1/usage").status_code == 401

    asyncio.run(store.close())


def test_usage_endpoint_since_filter(tmp_path, monkeypatch):
    """The `since` filter should exclude rows older than the cutoff."""
    store, s = _fresh_store(tmp_path, monkeypatch)

    async def seed():
        await store.record(
            user_id="u-since", endpoint="/v1/chat", provider="openrouter",
            model="m", usage={"total_tokens": 9, "prompt_tokens": 5,
                              "completion_tokens": 4},
            latency_ms=10,
        )

    asyncio.run(seed())

    # Future cutoff -> no rows.
    future = "2999-01-01T00:00:00"
    r = client.get("/v1/usage", headers=HDRS,
                   params={"user_id": "u-since", "since": future})
    assert r.status_code == 200
    assert r.json()["calls"] == 0

    # Past cutoff -> row appears.
    past = "2000-01-01T00:00:00"
    r = client.get("/v1/usage", headers=HDRS,
                   params={"user_id": "u-since", "since": past})
    assert r.json()["calls"] == 1

    asyncio.run(store.close())
