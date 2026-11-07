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


# ================= new endpoints =================
def _chat_mock(content: str, model: str = "meta-llama/llama-3.3-70b-instruct:free"):
    """respx mock returning an OpenAI-style chat completion from OpenRouter."""
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": model,
                "choices": [{"message": {"role": "assistant", "content": content}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
            },
        )
    )


@respx.mock
def test_models_listing():
    respx.get("https://openrouter.ai/api/v1/models").mock(
        return_value=httpx.Response(
            200, json={"data": [{"id": "meta-llama/llama-3.3-70b-instruct:free", "name": "Llama 3.3"}]}
        )
    )
    r = client.get("/v1/models", headers=HDRS)
    assert r.status_code == 200
    body = r.json()
    assert "openrouter" in body["models"]
    assert body["models"]["openrouter"][0]["id"].endswith(":free")


def test_models_requires_auth():
    r = client.get("/v1/models")
    assert r.status_code == 401


@respx.mock
def test_embeddings():
    respx.post("https://openrouter.ai/api/v1/embeddings").mock(
        return_value=httpx.Response(
            200,
            json={
                "model": "baichuan-ai/baichuan-embedding:free",
                "data": [{"index": 0, "embedding": [0.1, 0.2, 0.3]}],
                "usage": {"prompt_tokens": 4, "total_tokens": 4},
            },
        )
    )
    r = client.post(
        "/v1/embeddings", headers=HDRS, json={"input": ["hello world"], "user_id": "u1"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "openrouter"
    assert body["data"][0]["embedding"] == [0.1, 0.2, 0.3]
    assert body["usage"]["total_tokens"] == 4


@respx.mock
def test_structured_json_plain():
    _chat_mock('{"sentiment": "positive", "confidence": 0.9}')
    r = client.post(
        "/v1/structured",
        headers=HDRS,
        json={"messages": [{"role": "user", "content": "classify: I love it"}]},
    )
    assert r.status_code == 200
    assert r.json()["data"]["sentiment"] == "positive"


@respx.mock
def test_structured_json_in_code_fence():
    _chat_mock('Here you go:\n```json\n{"answer": 42}\n```\nHope that helps!')
    r = client.post(
        "/v1/structured",
        headers=HDRS,
        json={"messages": [{"role": "user", "content": "give me json"}]},
    )
    assert r.status_code == 200
    assert r.json()["data"] == {"answer": 42}


@respx.mock
def test_structured_schema_validation_fails():
    _chat_mock('{"sentiment": "not-a-valid-enum"}')
    schema = {
        "type": "object",
        "properties": {"sentiment": {"type": "string", "enum": ["positive", "negative"]}},
        "required": ["sentiment"],
    }
    r = client.post(
        "/v1/structured",
        headers=HDRS,
        json={"messages": [{"role": "user", "content": "classify"}], "schema": schema},
    )
    assert r.status_code == 422


@respx.mock
def test_summarize():
    _chat_mock('"Team Sync Notes"\n')
    r = client.post(
        "/v1/summarize",
        headers=HDRS,
        json={"text": "we discussed sprints, blockers and the release date", "user_id": "u1"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Team Sync Notes"


@respx.mock
def test_moderate_flagged():
    _chat_mock(json.dumps({
        "flagged": True,
        "categories": ["violence"],
        "reasoning": "Contains a threat.",
    }))
    r = client.post("/v1/moderate", headers=HDRS, json={"input": "I will hurt you"})
    assert r.status_code == 200
    body = r.json()
    assert body["flagged"] is True
    assert body["categories"] == ["violence"]


@respx.mock
def test_moderate_unparseable_output_not_flagged():
    _chat_mock("Sorry, I cannot do that.")
    r = client.post("/v1/moderate", headers=HDRS, json={"input": "hello"})
    assert r.status_code == 200
    assert r.json()["flagged"] is False
