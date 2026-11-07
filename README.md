# Code Race Platform

Supabase-backed platform for user accounts, schools, GitHub identities, competitions, points, and an AI gateway that fronts free LLM providers.

## Repository structure

```
.
├── supabase/                # Database schema + Edge Functions
│   ├── migrations/          # version-controlled database schema
│   ├── functions/automatic-updater/   # queued-record updater (moderates titles)
│   ├── functions/moderate-content/    # auth-gated proxy to /v1/moderate
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

Both `automatic-updater` and `moderate-content` also need these to talk to the
hardened ai-gateway's `/v1/moderate` endpoint:

- `AI_GATEWAY_URL` — base URL of the ai-gateway (e.g. `http://ai-gateway:8000`
  in docker-compose, or your deployed gateway's URL).
- `AI_GATEWAY_TOKEN` — the gateway's `INTERNAL_API_TOKEN` value.

If these are unset, the moderation gate becomes a no-op (the `automatic-updater`
upserts everything; `moderate-content` returns 500 on init). Both are safe to
leave unset while you're setting up, then turn on once the gateway is running.

## Current data model

- Supabase Auth manages email/password credentials.
- `profiles` stores full name, school, GitHub username, and points.
- `competitions` stores competition details.
- `user_competitions` stores participation and completion.
- `points_history` records point awards.
- `data_sources`, `records`, `sync_runs`, `change_log`, and `update_queue` support future data ingestion and update tracking.
- `content_moderation_log` records every AI moderation decision (who, what,
  flagged?, categories, reasoning, model/provider used) — see the
  "AI moderation" section below.

More fields and features can be added through new migrations as requirements become clear.

## AI moderation

User-generated content (profile fields, synced record titles) is safety-checked
by the hardened `ai-gateway`'s `/v1/moderate` endpoint before being stored.
Flagged content is rejected with an auditable trail in `content_moderation_log`.

**Two integration points:**

1. **`moderate-content` Edge Function** — the frontend calls this before
   submitting a profile update:
   ```ts
   const r = await fetch(`${supabaseUrl}/functions/v1/moderate-content`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${session.access_token}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       text: newFullName,
       context: 'profile.full_name',
     }),
   });
   const verdict = await r.json();
   if (verdict.flagged) {
     // show the user why their input was rejected
     setError(`Rejected: ${verdict.categories.join(', ')} — ${verdict.reasoning}`);
     return;
   }
   // proceed with the normal profile update
   ```
   JWT-verified (`verify_jwt = true` in `config.toml`); the caller's `user_id`
   is extracted from the JWT so the gateway's per-user rate limit + daily
   token quota apply per actual user.

2. **`automatic-updater` Edge Function** — before upserting each synced record,
   its `title` is sent to `/v1/moderate`. Flagged records are skipped (not
   upserted) and logged; the sync continues with the rest. Returns
   `records_flagged_and_skipped` in the success response. Fails open: if the
   gateway is unreachable, the upsert proceeds (moderation is best-effort,
   not a hard gate that can block ingest).

### Audit trail

The `content_moderation_log` table has RLS enabled — users can see moderation
decisions about their own content; the service role (Edge Functions) inserts.
The `moderation_summary` view (service_role only) aggregates daily counts by
context and category for an admin dashboard.

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
