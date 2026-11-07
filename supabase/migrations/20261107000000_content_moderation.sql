-- AI moderation log + integration with the hardened ai-gateway /v1/moderate endpoint.
--
-- Every call to the gateway's /v1/moderate endpoint (whether from the
-- moderate-content Edge Function for profile fields, or from the
-- automatic-updater for synced records) is persisted here so we have an
-- auditable trail of what was checked, what was flagged, and which
-- provider/model returned the verdict.

create extension if not exists pgcrypto;

-- Audit log of every AI moderation decision made by the platform.
create table if not exists public.content_moderation_log (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  -- Who initiated the check (null for system/sync-triggered checks, e.g.
  -- the automatic-updater moderating an ingested record's title).
  user_id uuid references public.profiles(id) on delete set null,
  -- Short label for what was being checked, e.g. 'profile.full_name',
  -- 'automatic-updater.record.title'. Capped at 80 chars.
  context text not null check (length(context) <= 80),
  -- The text that was sent to the classifier. Truncated to 1000 chars on
  -- insert so the log doesn't grow unbounded with full article bodies.
  input_text text not null,
  -- Mirror of the gateway's response.
  flagged boolean not null,
  categories text[] not null default '{}'::text[],
  reasoning text,
  -- Which upstream provider/model returned the verdict (useful for
  -- debugging inconsistent classifications across providers).
  model text,
  provider text
);

create index if not exists content_moderation_log_user_idx
  on public.content_moderation_log(user_id, checked_at desc);
create index if not exists content_moderation_log_flagged_idx
  on public.content_moderation_log(flagged, checked_at desc)
  where flagged;

alter table public.content_moderation_log enable row level security;

-- Authenticated users can SELECT their own rows. Inserts come only from
-- the service role (Edge Functions running with the service-role key).
revoke all on public.content_moderation_log from public, anon;
grant select on public.content_moderation_log to authenticated;
grant insert on public.content_moderation_log to service_role;

drop policy if exists "Users can view own moderation log" on public.content_moderation_log;
create policy "Users can view own moderation log"
on public.content_moderation_log for select to authenticated
using (auth.uid() = user_id);

-- Convenience view for an admin dashboard: counts by category over time.
-- service_role only (RLS = security_invoker off; the view itself doesn't
-- bypass RLS, but we don't grant it to authenticated).
create or replace view public.moderation_summary as
select
  date_trunc('day', checked_at) as day,
  context,
  count(*) as checks,
  count(*) filter (where flagged) as flagged_count,
  array_agg(distinct unnest) as categories_seen
from public.content_moderation_log, unnest(categories) as unnest
group by date_trunc('day', checked_at), context
order by day desc, context;
revoke all on public.moderation_summary from public, anon, authenticated;
grant select on public.moderation_summary to service_role;
