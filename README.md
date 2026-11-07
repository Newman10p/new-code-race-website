# new-code-race-website

Code Race Platform — a competition platform for managing users, schools, GitHub
identities, competitions, and a points system. The repo currently contains two
independent components that are being merged onto the `backend` branch:

```
.
├── ai-gateway/        # 100% free FastAPI service that fronts LLM providers (this branch)
├── supabase/          # Database schema + Edge Functions (on `main`, to be merged here)
├── docker-compose.yml # Gateway + Redis sidecar + persistence volume
└── .github/workflows/ # CI: pytest + docker build + compose validate
```

## What lives on which branch

| Branch   | Contents                                                        |
| -------- | -------------------------------------------------------------- |
| `main`   | Supabase migrations, the `automatic-updater` Edge Function, config |
| `backend`| `ai-gateway/` Python service, hardening, CI, `docker-compose.yml` |

The two have diverged and need to be reconciled before AI features can land
inside the platform itself. See `ai-gateway/README.md` for the service contract.

## ai-gateway (this branch)

A small Python service that sits between your app and free LLM providers
(OpenRouter, Groq, Ollama). Your frontend never talks to AI directly — it calls
your backend, which calls this gateway. API keys stay server-side; providers
fall back automatically when one is down or rate-limited.

Endpoints: `/v1/chat`, `/v1/chat/stream`, `/v1/embeddings`, `/v1/structured`,
`/v1/summarize`, `/v1/moderate`, `/v1/models`, `/v1/usage`, `/healthz`.

### Quickstart

```bash
# Local dev (single process, in-memory limiter, no persistence)
cd ai-gateway
pip install -r requirements.txt
cp .env.example .env       # set INTERNAL_API_TOKEN + one provider key
uvicorn app.main:app --reload --port 8000

# Or, with Redis + persistence + healthchecks:
docker compose up --build    # from the repo root
```

See [`ai-gateway/README.md`](ai-gateway/README.md) for the full API contract,
hardening knobs (`REDIS_URL`, `USAGE_DB_PATH`, `AI_DAILY_TOKEN_LIMIT_PER_USER`,
`AI_ALLOWED_MODELS`), and security notes.

### Tests

```bash
cd ai-gateway
pip install -r requirements.txt -r requirements-test.txt
python -m pytest tests/ -q          # 29 tests, fully offline
```

## License

See [LICENSE](LICENSE).
