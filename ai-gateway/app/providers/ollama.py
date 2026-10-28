"""Ollama provider — run a free LLM locally on your own server. $0 forever, private.

Install: https://ollama.com  ->  `ollama pull llama3.2`
Uses Ollama's native /api/chat endpoint (also OpenAI-compatible, but native is simpler).
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from ..config import Settings
from ..schemas import ChatRequest
from .base import LLMProvider, ProviderError


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, settings: Settings):
        self._s = settings
        self._url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"

    def _model(self, req: ChatRequest) -> str:
        return req.model or self._s.ollama_default_model

    def _payload(self, req: ChatRequest, stream: bool) -> dict[str, Any]:
        return {
            "model": self._model(req),
            "messages": [m.model_dump() for m in req.messages],
            "stream": stream,
            "options": {
                "temperature": req.temperature,
                "num_predict": req.max_tokens,
            },
        }

    async def chat(self, req: ChatRequest) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._s.request_timeout) as client:
                resp = await client.post(self._url, json=self._payload(req, False))
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Ollama unreachable at {self._s.ollama_base_url} "
                f"(is `ollama serve` running?): {exc}"
            ) from exc

        if resp.status_code >= 400:
            raise ProviderError(f"Ollama error {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        return {
            "content": (data.get("message") or {}).get("content", ""),
            "model": data.get("model", self._model(req)),
            "usage": {
                "prompt_tokens": data.get("prompt_eval_count", 0),
                "completion_tokens": data.get("eval_count", 0),
                "total_tokens": data.get("prompt_eval_count", 0)
                + data.get("eval_count", 0),
            },
        }

    async def stream(self, req: ChatRequest) -> AsyncIterator[str]:
        try:
            async with httpx.AsyncClient(timeout=self._s.request_timeout) as client:
                async with client.stream(
                    "POST", self._url, json=self._payload(req, True)
                ) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode(errors="replace")
                        raise ProviderError(
                            f"Ollama error {resp.status_code}: {body[:300]}"
                        )
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        obj = json.loads(line)
                        if text := (obj.get("message") or {}).get("content"):
                            yield text
                        if obj.get("done"):
                            break
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama unreachable: {exc}") from exc
