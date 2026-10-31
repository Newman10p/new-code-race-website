"""Provider registry — picks the right free backend for each request,
with automatic fallback if one provider is down or rate-limited.
"""
from __future__ import annotations

import logging

from .config import Settings
from .providers.base import LLMProvider, ProviderError
from .providers.groq import GroqProvider
from .providers.ollama import OllamaProvider
from .providers.openrouter import OpenRouterProvider

log = logging.getLogger("ai-gateway")


def build_provider(name: str, settings: Settings) -> LLMProvider:
    providers = {
        "openrouter": OpenRouterProvider,
        "groq": GroqProvider,
        "ollama": OllamaProvider,
    }
    try:
        return providers[name](settings)
    except KeyError as exc:
        raise ProviderError(f"Unknown provider '{name}'", status_code=400) from exc


class ProviderRouter:
    """Tries the requested/default provider first, then falls back to others."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def _order(self, preferred: str | None) -> list[str]:
        default = preferred or self.settings.default_provider
        order = [default]
        # Fallback chain: cloud free tiers first, local ollama last (it may be slow).
        for p in ("openrouter", "groq", "ollama"):
            if p not in order:
                order.append(p)
        return order

    def resolve(self, preferred: str | None) -> list[LLMProvider]:
        chain: list[LLMProvider] = []
        for name in self._order(preferred):
            try:
                chain.append(build_provider(name, self.settings))
            except ProviderError as exc:
                log.info("skipping provider %s: %s", name, exc)
        if not chain:
            raise ProviderError(
                "No AI provider is configured. Set OPENROUTER_API_KEY / GROQ_API_KEY, "
                "or run Ollama locally.",
                status_code=503,
            )
        return chain
