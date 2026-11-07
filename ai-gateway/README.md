# AI Passageway (Gateway)

A small, **100% free** backend service that sits between your app and LLM providers.
Your frontend/app never talks to the AI directly — it calls *your* backend, which calls
this gateway. API keys stay server-side, and you can swap free providers via env vars.

## Free provider options (pick at least one)

| Provider     | Cost            | How to get a key                     | Notes                          |
|--------------|-----------------|--------------------------------------|--------------------------------|
| OpenRouter   | $0 (`:free` models) | https://openrouter.ai/keys       | Many free Llama/Mistral models |
| Groq         | $0 free tier    | https://console.groq.com/keys        | Very fast, generous limits     |
| Ollama (local)| $0 forever     | none — `ollama pull llama3.2`        | Private, needs a machine to run|

The gateway automatically **falls back** between configured providers if one is down
or rate-limited.

## Quickstart

### Local (single process, in-memory limiter, no persistence)

```bash
cd ai-gateway
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit .env: set INTERNAL_API_TOKEN + one provider key
uvicorn app.main:app --reload --port 8000
```

### Docker Compose (recommended — Redis + persistence + healthchecks)

From the **repo root** (where `docker-compose.yml` lives):

```bash
cp ai-gateway/.env.example ai-gateway/.env   # edit: set INTERNAL_API_TOKEN + provider key
docker compose up --build
```

Compose automatically wires up:
- a `redis:7-alpine` sidecar for the distributed rate limiter,
- a `gateway-data` volume so the SQLite usage DB survives container restarts,
- `REDIS_URL=redis://redis:6379/0` and `USAGE_DB_PATH=/data/usage.db` env vars,
- healthchecks on both services.

Or build the image alone:

```bash
docker build -t ai-gateway ai-gateway
docker run --env-file ai-gateway/.env -p 8000:8000 ai-gateway
```

## API

### `POST /v1/chat`

Headers: `X-Internal-Token: <INTERNAL_API_TOKEN>`

```json
{
  "messages": [{"role": "user", "content": "Hello!"}],
  "user_id": "u-123",
  "provider": "openrouter",
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "stream": false
}
```

Response:

```json
{
  "content": "Hi there! How can I help?",
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "provider": "openrouter",
  "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18}
}
```

`provider` and `model` are optional — defaults come from `.env`.

### `POST /v1/chat/stream`
Same body; returns Server-Sent Events: `data: {"delta": "..."}` ... `data: [DONE]`.

### `GET /healthz`
Liveness probe. Shows which providers are configured, plus the active rate limiter
backend, whether usage persistence is on, and the daily token limit (if any).
```json
{
  "status": "ok",
  "version": "0.2.0",
  "default_provider": "openrouter",
  "rate_limiter": "redis",
  "usage_persistence": true,
  "daily_token_limit": 100000,
  "providers": {"openrouter": true, "groq": false, "ollama": true}
}
```

### `GET /v1/models?provider=openrouter`
Lists the models available on your configured free providers (keys stay server-side).

### `POST /v1/embeddings`
Free embeddings via OpenRouter — for semantic search, RAG, dedupe.
```json
{"input": ["some text", "more text"], "model": "baichuan-ai/baichuan-embedding:free"}
```
Returns OpenAI-style `data: [{"index": 0, "embedding": [...]}]` plus usage.

### `POST /v1/structured`
Ask the model for JSON back and get a **parsed object** (handles markdown fences / stray prose). Optionally pass a JSON Schema under `"schema"` and the gateway validates the output (422 if it doesn't conform).
```json
{
  "messages": [{"role": "user", "content": "Extract name & date from: 'Meeting with Sam on May 3'"}],
  "schema": {"type": "object", "properties": {"name": {"type": "string"}, "date": {"type": "string"}}, "required": ["name", "date"]}
}
```
Response: `{"data": {"name": "Sam", "date": "May 3"}, "model": "...", "provider": "...", "usage": {...}}`

### `POST /v1/summarize`
Short title for a chat thread/article (e.g. auto-naming conversations in a sidebar).
```json
{"text": "long conversation ...", "language": "en", "max_words": 8}
```
Response: `{"title": "Team Sync Notes", "model": "...", "provider": "..."}`

### `POST /v1/moderate`
Safety-check user-generated content before storing/showing it. Uses the free chat model as a classifier.
```json
{"input": "text to check"}
```
Response: `{"flagged": true, "categories": ["violence"], "reasoning": "...", "model": "...", "provider": "..."}`
Categories: violence, hate_speech, sexual_content, self_harm, illegal_activity.
Note: this is LLM-based moderation (best-effort), not a certified safety filter.

### `GET /v1/usage?user_id=...&since=...&until=...&limit=100`
Aggregate AI usage stats for a user (or all users when `user_id` is omitted).
Requires `USAGE_DB_PATH` to be set; otherwise returns `503`.
```json
{
  "user_id": "u-123",
  "calls": 42,
  "total_tokens": 5832,
  "prompt_tokens": 5200,
  "completion_tokens": 632,
  "by_endpoint": [{"endpoint": "/v1/chat", "calls": 30, "total_tokens": 5000}],
  "by_provider": [{"provider": "openrouter", "calls": 42, "total_tokens": 5832}],
  "recent": [{"ts": "2026-11-07T06:00:00+00:00", "endpoint": "/v1/chat",
               "provider": "openrouter", "model": "...", "total_tokens": 200,
               "latency_ms": 850, "status": "ok", "error": ""}]
}
```
`since` / `until` are ISO8601 UTC (e.g. `2026-11-07T00:00:00`).

All new endpoints require `X-Internal-Token` and respect the same rate limiter + model allowlist.

## Calling it from your main backend (example)

```python
import httpx

async def ask_ai(prompt: str, user_id: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "http://ai-gateway:8000/v1/chat",
            headers={"X-Internal-Token": os.environ["AI_GATEWAY_TOKEN"]},
            json={"messages": [{"role": "user", "content": prompt}], "user_id": user_id},
        )
        r.raise_for_status()
        return r.json()["content"]
```

## Hardening (production checklist)

These are the knobs that make the gateway safe to share across services / scale horizontally. All are **off by default** and lazy-imported, so the dev experience above stays unchanged.

### `REDIS_URL` — distributed rate limiter

Set this in **any** multi-instance / docker-compose deployment. Without it, the limiter is a single-process in-memory deque and resets on every restart. The Redis backend uses a ZSET sliding window (`ZADD` + `ZREMRANGEBYSCORE` + `ZCARD` + `EXPIRE` in one pipeline) so the check is correct across N gateway replicas.

```bash
REDIS_URL=redis://redis:6379/0
```

On Redis outages the limiter **fails open** (never blocks a request because of infra), with an `ERROR` log line so you can alert on it.

### `USAGE_DB_PATH` — SQLite usage persistence

Every call is recorded with `user_id`, `endpoint`, `provider`, `model`, token counts, latency, and status. Powers `GET /v1/usage` and the daily quota below. Lazy `aiosqlite`; if unset, persistence is disabled and `/v1/usage` returns `503`.

```bash
USAGE_DB_PATH=/data/usage.db   # docker-compose default
```

### `AI_DAILY_TOKEN_LIMIT_PER_USER` — per-user 24h token budget

A hard cap checked before every chat / embeddings call. Once a user has burned this many tokens in the last 24h they get `429` until the window rolls. Needs `USAGE_DB_PATH` set (otherwise the check is a no-op).

```bash
AI_DAILY_TOKEN_LIMIT_PER_USER=100000   # 0 = disabled
```

### `AI_ALLOWED_MODELS` — model allowlist

Comma-separated list of model IDs clients may request. Empty = any model allowed. Useful to lock prod down to a specific `:free` model and prevent surprise bills if a client ever points at a paid model.

```bash
AI_ALLOWED_MODELS=meta-llama/llama-3.3-70b-instruct:free,baichuan-ai/baichuan-embedding:free
```

## Security checklist (important!)

- Set a strong `INTERNAL_API_TOKEN`; keep this service **private** (internal network /
  VPN / firewall). Never expose it directly to the internet or your frontend.
- Rate limiting is per `user_id`:
  - in-memory by default (single-process only, resets on restart),
  - Redis-backed when `REDIS_URL` is set (multi-instance safe).
- Daily token quota is per `user_id`, 24h sliding window, persisted in SQLite.
- `.env` must never be committed. Use your deploy host's secret manager in production.
- The Dockerfile runs `--workers 1` to keep the in-memory limiter and SQLite
  single-writer; if you scale horizontally, set `REDIS_URL` so all workers share
  rate-limit state.

## CI

`.github/workflows/ci.yml` runs on push / PR to `backend` or `main`:

1. `pytest tests/ -v` against Python 3.11 and 3.12 in parallel,
2. builds the Docker image and smoke-tests `/healthz`,
3. validates the `docker-compose.yml` schema.

## Tests

```bash
pip install -r requirements.txt -r requirements-test.txt
python -m pytest tests/ -q
```

The suite is fully offline (HTTP is mocked with `respx`, Redis with `fakeredis`,
SQLite with a temp file). 29 tests cover the original endpoints plus the new
limiter backends, daily quota, and the usage store / `/v1/usage` endpoint.
