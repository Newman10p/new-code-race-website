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


# ---------- embeddings ----------
class EmbedRequest(BaseModel):
    input: list[str] = Field(min_length=1, max_length=64)
    model: Optional[str] = None
    provider: Optional[Literal["openrouter"]] = None
    user_id: Optional[str] = None


class Embedding(BaseModel):
    index: int
    embedding: list[float]


class EmbedResponse(BaseModel):
    model: str
    provider: str
    data: list[Embedding]
    usage: Usage = Usage()


# ---------- structured JSON output ----------
class StructuredRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    # Optional JSON Schema the model should conform to. If omitted, the model is
    # simply instructed to return a raw JSON object.
    schema_: Optional[dict] = Field(default=None, alias="schema")
    model: Optional[str] = None
    provider: Optional[Literal["openrouter", "groq", "ollama"]] = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    user_id: Optional[str] = None

    model_config = {"populate_by_name": True}

    @field_validator("messages")
    @classmethod
    def _last_message_is_user(cls, v):
        if v[-1].role != "user":
            raise ValueError("last message must have role 'user'")
        return v


class StructuredResponse(BaseModel):
    data: dict  # parsed JSON object
    model: str
    provider: str
    usage: Usage = Usage()


# ---------- title summarization ----------
class SummarizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=32_000)
    language: str = "en"
    max_words: int = Field(default=8, ge=3, le=20)
    model: Optional[str] = None
    provider: Optional[Literal["openrouter", "groq", "ollama"]] = None
    user_id: Optional[str] = None


class SummarizeResponse(BaseModel):
    title: str
    model: str
    provider: str


# ---------- moderation / safety ----------
class ModerateRequest(BaseModel):
    input: str = Field(min_length=1, max_length=32_000)
    user_id: Optional[str] = None


class ModerateResponse(BaseModel):
    flagged: bool
    categories: list[str]
    reasoning: str
    model: str
    provider: str
