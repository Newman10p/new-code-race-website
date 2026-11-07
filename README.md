# Code Race Platform

Supabase-backed platform for user accounts, schools, GitHub identities, competitions, points, and an AI gateway that fronts free LLM providers.

## Repository structure

```
.
├── supabase/                # Database schema + Edge Functions
│   ├── migrations/          # version-controlled database schema
│   ├── functions/automatic-updater/   # queued-record updater Edge Function
│   └── config.toml          # local Supabase CLI configuration
├── ai-gateway/              # 100% free FastAPI service that fronts LLM providers
│   └── …                    # OpenRouter + Groq + Ollama with fallback
├── docker-compose.yml       # Gateway + Redis sidecar + persistence volume
└── .github/workflows/       # CI: pytest + docker build + compose validate
```

## Supabase setup

This repository contains the database migration and Edge Function source. The Supabase project still needs to be linked to this GitHub repository from the Supabase dashboard.

1. Open the correct Supabase project.
2. Open **Project Settings → Integrations → GitHub** (the exact menu label may vary).
3. Connect GitHub and select **Newman10p/new-code-race-website**.
4. Select the repository's `main` branch and the `supabase` directory if prompted.
5. Review the proposed database migration before applying it.

**Important:** The database objects were initially created manually in the Supabase SQL Editor. Before applying the committed migration to that same project, check the migration preview and migration history. The migration is designed to be repeatable for the objects in this repository, but do not reset or overwrite the live database to connect GitHub.

## Edge Function secrets

The `automatic-updater` function expects these environment variables:

- `SUPABASE_URL` — supplied by the Supabase Edge Functions runtime.
- `SUPABASE_SERVICE_ROLE_KEY` — supplied by the Supabase Edge Functions runtime. Never put this key in frontend code or Git.
- `CRON_SECRET` — create this in Supabase Edge Function secrets. Keep it private.

The function uses its own `CRON_SECRET` authorization check, so the function's gateway JWT verification is configured as disabled in `supabase/config.toml`. Do not expose the service-role key or the cron secret.

## Current data model

- Supabase Auth manages email/password credentials.
- `profiles` stores full name, school, GitHub username, and points.
- `competitions` stores competition details.
- `user_competitions` stores participation and completion.
- `points_history` records point awards.
- `data_sources`, `records`, `sync_runs`, `change_log`, and `update_queue` support future data ingestion and update tracking.

More fields and features can be added through new migrations as requirements become clear.

## ai-gateway

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
