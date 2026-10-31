"""FastAPI app — the AI passageway.

Endpoints
---------
GET  /healthz          liveness + which providers are configured
POST /v1/chat          non-streaming completion
POST /v1/chat/stream   SSE streaming completion

Auth: internal shared secret via `X-Internal-Token` header (set INTERNAL_API_TOKEN).
"""
from __future__ import annotations

import hmac
import json
import logging
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from .config import get_settings
from .router import ProviderRouter
from .schemas import ChatRequest, ChatResponse, Usage
from .providers.base import ProviderError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("ai-gateway")

app = FastAPI(title="AI Passageway", version="0.1.0")


# ---------- auth: only *your* backend may call this service ----------
def require_token(x_internal_token: str = Header(default="")) -> None:
    expected = get_settings().internal_api_token
    if not expected:
        return  # dev mode: no token configured -> open. ALWAYS set one in prod!
    if not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Token")


# ---------- tiny in-memory rate limiter (per user_id, fixed 60s window) ----------
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(req: ChatRequest) -> None:
    limit = get_settings().rate_limit_per_minute
    key = req.user_id or "anonymous"
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded, slow down.")
    q.append(now)


def _check_model_allowlist(req: ChatRequest) -> None:
    allowed = get_settings().allowed_models
    if allowed and req.model and req.model not in allowed:
        raise HTTPException(status_code=400, detail=f"Model '{req.model}' is not allowed.")


# ---------- endpoints ----------
@app.get("/healthz")
def healthz():
    s = get_settings()
    return {
        "status": "ok",
        "default_provider": s.default_provider,
        "providers": {
            "openrouter": bool(s.openrouter_api_key),
            "groq": bool(s.groq_api_key),
            "ollama": True,  # always constructible; check reachability at call time
        },
    }


@app.post("/v1/chat", response_model=ChatResponse, dependencies=[Depends(require_token)])
async def chat(req: ChatRequest) -> ChatResponse:
    _check_model_allowlist(req)
    rate_limit(req)
    router = ProviderRouter(get_settings())
    last_err: Exception | None = None

    for provider in router.resolve(req.provider):
        try:
            t0 = time.perf_counter()
            result = await provider.chat(req)
            ms = int((time.perf_counter() - t0) * 1000)
            log.info(
                "chat ok provider=%s model=%s user=%s ms=%d tokens=%d",
                provider.name, result["model"], req.user_id, ms,
                result["usage"]["total_tokens"],
            )
            return ChatResponse(
                content=result["content"],
                model=result["model"],
                provider=provider.name,
                usage=Usage(**result["usage"]),
            )
        except ProviderError as exc:
            last_err = exc
            log.warning("provider %s failed: %s -> trying fallback", provider.name, exc)

    raise HTTPException(status_code=502, detail=f"All providers failed: {last_err}")


@app.post("/v1/chat/stream", dependencies=[Depends(require_token)])
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Server-Sent Events: each event is a JSON object {'delta': text}."""
    _check_model_allowlist(req)
    rate_limit(req)
    router = ProviderRouter(get_settings())
    chain = router.resolve(req.provider)
    provider = chain[0]  # streaming does not auto-failover mid-response

    async def gen():
        try:
            async for chunk in provider.stream(req):
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except ProviderError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
