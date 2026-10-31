"""Central configuration, loaded from environment variables (.env supported)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

try:  # optional, only needed if you use a .env file
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def _csv(name: str) -> list[str]:
    return [v.strip() for v in os.getenv(name, "").split(",") if v.strip()]


@dataclass
class Settings:
    # Shared secret your backend sends as `X-Internal-Token`. REQUIRED in prod.
    internal_api_token: str = os.getenv("INTERNAL_API_TOKEN", "")

    # Which provider to use when the request doesn't specify one.
    default_provider: str = os.getenv("AI_DEFAULT_PROVIDER", "ollama")

    # Free cloud option 1: OpenRouter (free-tier models), https://openrouter.ai/keys
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_base_url: str = os.getenv(
        "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
    )
    openrouter_default_model: str = os.getenv(
        "OPENROUTER_DEFAULT_MODEL", "meta-llama/llama-3.3-70b-instruct:free"
    )

    # Free cloud option 2: Groq (very fast free tier), https://console.groq.com/keys
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_base_url: str = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    groq_default_model: str = os.getenv(
        "GROQ_DEFAULT_MODEL", "llama-3.3-70b-versatile"
    )

    # Free local option: Ollama, https://ollama.com  (no key, $0, private)
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_default_model: str = os.getenv("OLLAMA_DEFAULT_MODEL", "llama3.2")

    # Outbound HTTP timeout (seconds) and simple per-user rate limit.
    request_timeout: float = float(os.getenv("AI_REQUEST_TIMEOUT", "60"))
    rate_limit_per_minute: int = int(os.getenv("AI_RATE_LIMIT_PER_MINUTE", "30"))

    allowed_models: list[str] = field(default_factory=lambda: _csv("AI_ALLOWED_MODELS"))


def get_settings() -> Settings:
    return Settings()
