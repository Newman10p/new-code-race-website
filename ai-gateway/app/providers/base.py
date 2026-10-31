"""Provider base class + shared error types."""
from __future__ import annotations

import abc
from typing import Any, AsyncIterator

from ..schemas import ChatRequest


class ProviderError(Exception):
    """Raised when an upstream AI provider returns an error / is unreachable."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class ProviderNotConfigured(ProviderError):
    def __init__(self, provider: str, hint: str):
        super().__init__(
            f"Provider '{provider}' is not configured. {hint}", status_code=503
        )


class LLMProvider(abc.ABC):
    """Every free provider implements this tiny interface."""

    name: str

    @abc.abstractmethod
    async def chat(self, req: ChatRequest) -> dict[str, Any]:
        """Return {'content': str, 'model': str, 'usage': {...}}."""

    @abc.abstractmethod
    async def stream(self, req: ChatRequest) -> AsyncIterator[str]:
        """Yield text chunks."""
        raise NotImplementedError
        yield ""  # pragma: no cover  (makes the method an async generator)

    def _payload(self, req: ChatRequest, model: str) -> dict[str, Any]:
        """OpenAI-compatible request body (used by OpenRouter & Groq)."""
        return {
            "model": model,
            "messages": [m.model_dump() for m in req.messages],
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        }
