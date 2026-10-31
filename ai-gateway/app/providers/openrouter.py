"""OpenRouter provider — free-tier models via one OpenAI-compatible endpoint.

Sign up (free): https://openrouter.ai/keys
Free models end with ':free', e.g. 'meta-llama/llama-3.3-70b-instruct:free'.
List them: GET https://openrouter.ai/api/v1/models  (filter pricing.prompt == "0")
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from ..config import Settings
from ..schemas import ChatRequest
from .base import LLMProvider, ProviderError


class OpenRouterProvider(LLMProvider):
    name = "openrouter"

    def __init__(self, settings: Settings):
        if not settings.openrouter_api_key:
            from .base import ProviderNotConfigured

            raise ProviderNotConfigured(
                "openrouter", "Set OPENROUTER_API_KEY (free at openrouter.ai/keys)."
            )
        self._s = settings
        self._headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "HTTP-Referer": getattr(settings, "app_url", ""),  # optional attribution
            "X-Title": "group-app-ai-gateway",
        }

    @property
    def _url(self) -> str:
        return f"{self._s.openrouter_base_url}/chat/completions"

    def _model(self, req: ChatRequest) -> str:
        return req.model or self._s.openrouter_default_model

    async def chat(self, req: ChatRequest) -> dict[str, Any]:
        model = self._model(req)
        payload = self._payload(req, model)
        try:
            async with httpx.AsyncClient(timeout=self._s.request_timeout) as client:
                resp = await client.post(self._url, json=payload, headers=self._headers)
        except httpx.HTTPError as exc:
            raise ProviderError(f"OpenRouter unreachable: {exc}") from exc

        if resp.status_code >= 400:
            raise ProviderError(
                f"OpenRouter error {resp.status_code}: {resp.text[:300]}"
            )
        data: dict[str, Any] = resp.json()
        choice = (data.get("choices") or [{}])[0]
        usage = data.get("usage") or {}
        return {
            "content": (choice.get("message") or {}).get("content", ""),
            "model": data.get("model", model),
            "usage": {
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            },
        }

    async def stream(self, req: ChatRequest) -> AsyncIterator[str]:
        payload = {**self._payload(req, self._model(req)), "stream": True}
        try:
            async with httpx.AsyncClient(timeout=self._s.request_timeout) as client:
                async with client.stream(
                    "POST", self._url, json=payload, headers=self._headers
                ) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode(errors="replace")
                        raise ProviderError(
                            f"OpenRouter error {resp.status_code}: {body[:300]}"
                        )
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        chunk = line[5:].strip()
                        if chunk == "[DONE]":
                            break
                        try:
                            obj = json.loads(chunk)
                        except json.JSONDecodeError:
                            continue
                        delta = (obj.get("choices") or [{}])[0].get("delta", {})
                        if text := delta.get("content"):
                            yield text
        except httpx.HTTPError as exc:
            raise ProviderError(f"OpenRouter unreachable: {exc}") from exc
