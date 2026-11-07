"""FastAPI app — the AI passageway.

Endpoints
---------
GET  /healthz              liveness + which providers are configured
GET  /v1/models            list models available on configured providers
POST /v1/chat              non-streaming completion
POST /v1/chat/stream       SSE streaming completion
POST /v1/embeddings        free embeddings (OpenRouter) for search / RAG
POST /v1/structured        JSON output, optionally validated against a schema
POST /v1/summarize         short title for a conversation/article
POST /v1/moderate          flag unsafe user content before acting on it

Auth: internal shared secret via `X-Internal-Token` header (set INTERNAL_API_TOKEN).
"""
from __future__ import annotations

import hmac
import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from .config import get_settings
from .rate_limit import get_rate_limiter
from .router import ProviderRouter, build_provider
from .schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
    ModerateRequest,
    ModerateResponse,
    StructuredRequest,
    StructuredResponse,
    SummarizeRequest,
    SummarizeResponse,
    Usage,
)
from .providers.base import ProviderError
from .usage_store import get_usage_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("ai-gateway")

app = FastAPI(title="AI Passageway", version="0.2.0")


# ---------- auth: only *your* backend may call this service ----------
def require_token(x_internal_token: str = Header(default="")) -> None:
    expected = get_settings().internal_api_token
    if not expected:
        return  # dev mode: no token configured -> open. ALWAYS set one in prod!
    if not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Token")


# ---------- rate limiting + per-user daily token quota ----------
def rate_limit(user_id: str | None) -> None:
    """Sliding 60s window cap, per user_id. Redis-backed when REDIS_URL is set."""
    s = get_settings()
    get_rate_limiter(s).check(user_id, s.rate_limit_per_minute)


async def enforce_daily_quota(user_id: str | None) -> None:
    """Reject with 429 if the user has exceeded their 24h token budget.

    No-op when AI_DAILY_TOKEN_LIMIT_PER_USER is 0 or when usage persistence is
    disabled (can't count what we don't store).
    """
    s = get_settings()
    if not s.daily_token_limit_per_user:
        return
    store = get_usage_store(s)
    if store is None:
        return
    used = await store.daily_tokens(user_id)
    if used >= s.daily_token_limit_per_user:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily token budget exhausted ({used}/"
                f"{s.daily_token_limit_per_user}). Resets in <24h."
            ),
        )


async def _record(
    *,
    user_id: str | None,
    endpoint: str,
    provider: str | None,
    model: str | None,
    usage: dict | None,
    latency_ms: int,
    status: str = "ok",
    error: str | None = None,
) -> None:
    store = get_usage_store(get_settings())
    if store is None:
        return
    await store.record(
        user_id=user_id,
        endpoint=endpoint,
        provider=provider,
        model=model,
        usage=usage,
        latency_ms=latency_ms,
        status=status,
        error=error,
    )


def _check_model_allowlist(req: ChatRequest) -> None:
    allowed = get_settings().allowed_models
    if allowed and req.model and req.model not in allowed:
        raise HTTPException(status_code=400, detail=f"Model '{req.model}' is not allowed.")


async def _chat_with_fallback(req: ChatRequest, endpoint: str = "/v1/chat") -> dict:
    """Run a chat request through the provider chain, returning the raw result dict.

    Result dict: {'content': str, 'model': str, 'usage': {...}, 'provider': str}
    Raises HTTPException(502) if every provider fails. Records usage + latency
    to the persistent store (best-effort).
    """
    await enforce_daily_quota(req.user_id)
    router = ProviderRouter(get_settings())
    last_err: Exception | None = None
    t0 = time.perf_counter()

    for provider in router.resolve(req.provider):
        try:
            result = await provider.chat(req)
            ms = int((time.perf_counter() - t0) * 1000)
            log.info(
                "chat ok provider=%s model=%s user=%s ms=%d tokens=%d",
                provider.name, result["model"], req.user_id, ms,
                result["usage"]["total_tokens"],
            )
            result["provider"] = provider.name
            await _record(
                user_id=req.user_id, endpoint=endpoint,
                provider=provider.name, model=result["model"],
                usage=result["usage"], latency_ms=ms,
            )
            return result
        except ProviderError as exc:
            last_err = exc
            log.warning("provider %s failed: %s -> trying fallback", provider.name, exc)

    ms = int((time.perf_counter() - t0) * 1000)
    await _record(
        user_id=req.user_id, endpoint=endpoint, provider=None, model=None,
        usage=None, latency_ms=ms, status="error",
        error=f"all providers failed: {last_err}",
    )
    raise HTTPException(status_code=502, detail=f"All providers failed: {last_err}")


# ---------- endpoints ----------
@app.get("/healthz")
def healthz():
    s = get_settings()
    return {
        "status": "ok",
        "version": app.version,
        "default_provider": s.default_provider,
        "rate_limiter": "redis" if s.redis_url else "in-memory",
        "usage_persistence": bool(s.usage_db_path),
        "daily_token_limit": s.daily_token_limit_per_user or None,
        "providers": {
            "openrouter": bool(s.openrouter_api_key),
            "groq": bool(s.groq_api_key),
            "ollama": True,  # always constructible; check reachability at call time
        },
    }


@app.get("/v1/models", dependencies=[Depends(require_token)])
async def list_models(provider: str | None = None):
    """List models available from the configured free providers (no API key leaks)."""
    s = get_settings()
    names = [provider] if provider else ["openrouter", "groq"]
    out: dict[str, list[dict]] = {}
    errors: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=s.request_timeout) as client:
        for name in names:
            if name == "openrouter":
                if not s.openrouter_api_key:
                    errors[name] = "not configured"
                    continue
                url, headers = f"{s.openrouter_base_url}/models", {
                    "Authorization": f"Bearer {s.openrouter_api_key}"
                }
            elif name == "groq":
                if not s.groq_api_key:
                    errors[name] = "not configured"
                    continue
                url, headers = f"{s.groq_base_url}/models", {
                    "Authorization": f"Bearer {s.groq_api_key}"
                }
            else:
                continue
            try:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json().get("data", [])
                out[name] = [
                    {"id": m.get("id"), "name": m.get("name") or m.get("id")}
                    for m in data
                ]
            except httpx.HTTPError as exc:
                errors[name] = str(exc)[:200]
    return {"models": out, "errors": errors}


@app.post("/v1/chat", response_model=ChatResponse, dependencies=[Depends(require_token)])
async def chat(req: ChatRequest) -> ChatResponse:
    _check_model_allowlist(req)
    rate_limit(req.user_id)
    result = await _chat_with_fallback(req, endpoint="/v1/chat")
    return ChatResponse(
        content=result["content"],
        model=result["model"],
        provider=result["provider"],
        usage=Usage(**result["usage"]),
    )


@app.post("/v1/chat/stream", dependencies=[Depends(require_token)])
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Server-Sent Events: each event is a JSON object {'delta': text}."""
    _check_model_allowlist(req)
    rate_limit(req.user_id)
    await enforce_daily_quota(req.user_id)
    router = ProviderRouter(get_settings())
    chain = router.resolve(req.provider)
    provider = chain[0]  # streaming does not auto-failover mid-response

    async def gen():
        t0 = time.perf_counter()
        try:
            async for chunk in provider.stream(req):
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
            yield "data: [DONE]\n\n"
            ms = int((time.perf_counter() - t0) * 1000)
            await _record(
                user_id=req.user_id, endpoint="/v1/chat/stream",
                provider=provider.name, model=req.model, usage=None,
                latency_ms=ms,
            )
        except ProviderError as exc:
            ms = int((time.perf_counter() - t0) * 1000)
            await _record(
                user_id=req.user_id, endpoint="/v1/chat/stream",
                provider=provider.name, model=req.model, usage=None,
                latency_ms=ms, status="error", error=str(exc),
            )
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


# ---------- embeddings (free, via OpenRouter) ----------
@app.post("/v1/embeddings", response_model=EmbedResponse, dependencies=[Depends(require_token)])
async def embeddings(req: EmbedRequest) -> EmbedResponse:
    """Turn text into vectors — useful for semantic search / RAG / dedupe."""
    s = get_settings()
    allowed = s.allowed_models
    if allowed and req.model and req.model not in allowed:
        raise HTTPException(status_code=400, detail=f"Model '{req.model}' is not allowed.")
    rate_limit(req.user_id)
    await enforce_daily_quota(req.user_id)
    try:
        provider = build_provider("openrouter", s)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    t0 = time.perf_counter()
    try:
        result = await provider.embed(req.input, model=req.model)
    except ProviderError as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        await _record(
            user_id=req.user_id, endpoint="/v1/embeddings",
            provider=provider.name, model=req.model, usage=None,
            latency_ms=ms, status="error", error=str(exc),
        )
        raise HTTPException(status_code=502, detail=str(exc))
    ms = int((time.perf_counter() - t0) * 1000)
    log.info("embed ok provider=%s model=%s count=%d user=%s",
             provider.name, result["model"], len(req.input), req.user_id)
    await _record(
        user_id=req.user_id, endpoint="/v1/embeddings",
        provider=provider.name, model=result["model"],
        usage=result["usage"], latency_ms=ms,
    )
    return EmbedResponse(
        model=result["model"],
        provider=provider.name,
        data=result["data"],
        usage=Usage(**result["usage"]),
    )


# ---------- usage query endpoint ----------
@app.get("/v1/usage", dependencies=[Depends(require_token)])
async def usage(
    user_id: str | None = Query(default=None),
    since: str | None = Query(default=None, description="ISO8601 UTC, e.g. 2026-11-07T00:00:00"),
    until: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
):
    """Aggregate AI usage stats. Requires persistence (USAGE_DB_PATH) to be set."""
    store = get_usage_store(get_settings())
    if store is None:
        raise HTTPException(
            status_code=503,
            detail="Usage persistence is disabled. Set USAGE_DB_PATH to enable /v1/usage.",
        )
    return await store.get_usage(
        user_id=user_id, since=since, until=until, limit=limit
    )


# ---------- structured JSON output ----------
def _extract_json_object(text: str) -> dict:
    """Best-effort parse of a model reply into a JSON object.

    Handles markdown code fences and leading/trailing prose.
    """
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("model did not return a JSON object")
        obj = json.loads(text[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError("model returned JSON but not an object")
    return obj


@app.post("/v1/structured", response_model=StructuredResponse, dependencies=[Depends(require_token)])
async def structured(req: StructuredRequest) -> StructuredResponse:
    """Ask the model for JSON back; optionally validate it against your schema."""
    rate_limit(req.user_id)
    messages = list(req.messages)
    instruction = (
        "Respond with ONLY a valid JSON object, no prose, no markdown fences."
    )
    if req.schema_:
        instruction += f" It must conform to this JSON Schema:\n{json.dumps(req.schema_)}"
    messages.insert(0, ChatMessage(role="system", content=instruction))
    chat_req = ChatRequest(
        messages=messages,
        model=req.model,
        provider=req.provider,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        user_id=req.user_id,
    )
    result = await _chat_with_fallback(chat_req, endpoint="/v1/structured")
    try:
        data = _extract_json_object(result["content"])
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Provider returned non-JSON output: {exc}. Raw: {result['content'][:200]}",
        )
    if req.schema_:
        try:
            import jsonschema

            jsonschema.validate(data, req.schema_)
        except ImportError:
            pass  # optional dependency; skip strict validation
        except jsonschema.ValidationError as exc:
            raise HTTPException(
                status_code=422, detail=f"Model output failed schema validation: {exc.message}"
            )
    return StructuredResponse(
        data=data,
        model=result["model"],
        provider=result["provider"],
        usage=Usage(**result["usage"]),
    )


# ---------- conversation/article title summarization ----------
@app.post("/v1/summarize", response_model=SummarizeResponse, dependencies=[Depends(require_token)])
async def summarize(req: SummarizeRequest) -> SummarizeResponse:
    """Generate a short title for a chat thread or article (e.g. sidebar labels)."""
    rate_limit(req.user_id)
    prompt = (
        f"Summarize the following text into a concise title of at most {req.max_words} "
        f"words, in language '{req.language}'. Reply with ONLY the title, no quotes, no punctuation at the end.\n\n"
        f"Text:\n{req.text[:8000]}"
    )
    chat_req = ChatRequest(
        messages=[ChatMessage(role="user", content=prompt)],
        model=req.model,
        provider=req.provider,
        temperature=0.3,
        max_tokens=64,
        user_id=req.user_id,
    )
    result = await _chat_with_fallback(chat_req, endpoint="/v1/summarize")
    title = result["content"].strip().strip('"').strip("'").splitlines()[0][:120]
    return SummarizeResponse(title=title, model=result["model"], provider=result["provider"])


# ---------- moderation / safety ----------
_MOD_CATEGORIES = ["violence", "hate_speech", "sexual_content", "self_harm", "illegal_activity"]


@app.post("/v1/moderate", response_model=ModerateResponse, dependencies=[Depends(require_token)])
async def moderate(req: ModerateRequest) -> ModerateResponse:
    """Check whether user-generated content is unsafe before you store/show it."""
    rate_limit(req.user_id)
    prompt = (
        "You are a strict content-moderation classifier. Analyse the user text below.\n"
        f"Categories: {', '.join(_MOD_CATEGORIES)}.\n"
        'Reply with ONLY a JSON object like: {"flagged": true|false, '
        '"categories": ["..."], "reasoning": "one short sentence"}.\n'
        '"categories" must be [] when flagged is false.\n\n'
        f"Text:\n{req.input[:8000]}"
    )
    chat_req = ChatRequest(
        messages=[ChatMessage(role="user", content=prompt)],
        temperature=0.0,
        max_tokens=256,
        user_id=req.user_id,
    )
    result = await _chat_with_fallback(chat_req, endpoint="/v1/moderate")
    try:
        data = _extract_json_object(result["content"])
        flagged = bool(data.get("flagged", False))
        categories = [c for c in data.get("categories", []) if c in _MOD_CATEGORIES]
        reasoning = str(data.get("reasoning", ""))[:500]
    except (ValueError, json.JSONDecodeError):
        # Fail closed-ish: unparseable model output => not flagged, but log loudly.
        log.warning("moderate: could not parse model output: %r", result["content"][:200])
        flagged, categories, reasoning = False, [], "model output unparseable"
    return ModerateResponse(
        flagged=flagged,
        categories=categories,
        reasoning=reasoning,
        model=result["model"],
        provider=result["provider"],
    )
