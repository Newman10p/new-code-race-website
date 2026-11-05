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

```bash
cd ai-gateway
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit .env: set INTERNAL_API_TOKEN + one provider key
uvicorn app.main:app --reload --port 8000
```

Or with Docker:

```bash
docker build -t ai-gateway .
docker run --env-file .env -p 8000:8000 ai-gateway
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
Shows which providers are configured.

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

## Security checklist (important!)

- Set a strong `INTERNAL_API_TOKEN`; keep this service **private** (internal network /
  VPN / firewall). Never expose it directly to the internet or your frontend.
- Rate limiting is per `user_id` in-memory (resets on restart). For multi-instance
  deployments use Redis (e.g. `slowapi`) later.
- `.env` must never be committed. Use your deploy host's secret manager in production.

## Tests

```bash
pip install pytest pytest-asyncio respx
python -m pytest tests/ -q
```
