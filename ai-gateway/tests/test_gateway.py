"""Offline unit tests: no real API keys or network needed (mocked with respx)."""
from __future__ import annotations

import os

# Configure BEFORE importing the app (settings read env at import time).
os.environ.update(
    INTERNAL_API_TOKEN="test-token",
    OPENROUTER_API_KEY="fake-key",
    AI_DEFAULT_PROVIDER="openrouter",
    AI_RATE_LIMIT_PER_MINUTE="100",
)

import json

import httpx
import respx
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
HDRS = {"X-Internal-Token": "test-token"}


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["providers"]["openrouter"] is True


def test_auth_required():
    r = client.post(
        "/v1/chat", json={"messages": [{"role": "user", "content": "hi"}]}
    )
    assert r.status_code == 401


def test_validation_bad_role():
    r = client.post(
        "/v1/chat",
        headers=HDRS,
        json={"messages": [{"role": "hacker", "content": "hi"}]},
    )
    assert r.status_code == 422


@respx.mock
def test_chat_success():
    route = respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "meta-llama/llama-3.3-70b-instruct:free",
                "choices": [{"message": {"role": "assistant", "content": "Hello!"}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
            },
        )
    )
    r = client.post(
        "/v1/chat",
        headers=HDRS,
        json={"messages": [{"role": "user", "content": "hi"}], "user_id": "u1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["content"] == "Hello!"
    assert body["provider"] == "openrouter"
    assert body["usage"]["total_tokens"] == 7
    assert route.called


@respx.mock
def test_fallback_when_primary_down():
    """OpenRouter errors -> gateway should fall back to Ollama."""
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(429, text="rate limited")
    )
    # Groq is not configured (no key) so it's skipped; ollama is next in chain.
    respx.post("http://localhost:11434/api/chat").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "llama3.2",
                "message": {"role": "assistant", "content": "From ollama"},
                "prompt_eval_count": 3,
                "eval_count": 2,
            },
        )
    )
    r = client.post(
        "/v1/chat",
        headers=HDRS,
        json={"messages": [{"role": "user", "content": "hi"}], "provider": "openrouter"},
    )
    assert r.status_code == 200
    assert r.json()["content"] == "From ollama"
    assert r.json()["provider"] == "ollama"


@respx.mock
def test_stream():
    sse = (
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
        "data: [DONE]\n\n"
    ).encode()
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(
            200, content=sse, headers={"content-type": "text/event-stream"}
        )
    )
    with client.stream(
        "POST",
        "/v1/chat/stream",
        headers=HDRS,
        json={"messages": [{"role": "user", "content": "hi"}]},
    ) as r:
        assert r.status_code == 200
        raw = "\n".join(r.iter_lines())
    events = []
    for line in raw.split("\n"):
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload and payload != "[DONE]":
                events.append(json.loads(payload))
    deltas = [e["delta"] for e in events if "delta" in e]
    assert "".join(deltas) == "Hello"
