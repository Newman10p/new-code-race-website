# CodeQuest Platform

Supabase-backed platform for user accounts, schools, GitHub identities, competitions, points, and future features.

## Repository structure

- `supabase/migrations/` — version-controlled database schema.
- `supabase/functions/automatic-updater/` — source for the queued-record updater.
- `supabase/config.toml` — local Supabase CLI configuration.

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
