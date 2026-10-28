"""Pydantic models — the public contract of the AI passageway."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1, max_length=32_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    # Optional overrides — clients normally leave these empty.
    model: Optional[str] = None
    provider: Optional[Literal["openrouter", "groq", "ollama"]] = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    stream: bool = False
    # Lets your app tag usage for logging / quotas.
    user_id: Optional[str] = None

    @field_validator("messages")
    @classmethod
    def _last_message_is_user(cls, v):
        if v[-1].role != "user":
            raise ValueError("last message must have role 'user'")
        return v


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatResponse(BaseModel):
    content: str
    model: str
    provider: str
    usage: Usage = Usage()
