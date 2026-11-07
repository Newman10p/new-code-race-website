-- Initial schema for the Code Race platform.
-- Apply with Supabase CLI migrations or through the SQL Editor on a fresh project.

create extension if not exists pgcrypto;

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text,
  source_url text,
  is_active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete set null,
  external_id text,
  category text,
  title text,
  data jsonb not null default '{}'::jsonb,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists records_category_idx on public.records(category);
create index if not exists records_data_idx on public.records using gin(data);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  records_added integer not null default 0,
  records_updated integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  record_id uuid,
  source_id uuid references public.data_sources(id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);
create index if not exists change_log_record_idx on public.change_log(record_id);

create table if not exists public.update_queue (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources(id) on delete cascade,
  task_type text not null default 'sync',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists update_queue_pending_idx on public.update_queue(status, scheduled_at);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  school text,
  github_username text,
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_competitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  status text not null default 'registered'
    check (status in ('registered', 'in_progress', 'completed')),
  points_earned integer not null default 0 check (points_earned >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, competition_id)
);
create index if not exists user_competitions_user_idx on public.user_competitions(user_id);
create index if not exists user_competitions_competition_idx on public.user_competitions(competition_id);

create table if not exists public.points_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points > 0),
  reason text not null,
  competition_id uuid references public.competitions(id) on delete set null,
  awarded_at timestamptz not null default now()
);
create index if not exists points_history_user_idx on public.points_history(user_id);

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists data_sources_updated_at on public.data_sources;
create trigger data_sources_updated_at before update on public.data_sources
for each row execute function public.set_updated_at();

drop trigger if exists records_updated_at on public.records;
create trigger records_updated_at before update on public.records
for each row execute function public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- Automatically create a profile when a Supabase Auth user registers.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, school, github_username)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'school',
    new.raw_user_meta_data ->> 'github_username'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Record all changes to generic records.
create or replace function public.log_record_changes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.change_log(record_id, source_id, action, new_data)
    values (new.id, new.source_id, 'insert', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.change_log(record_id, source_id, action, old_data, new_data)
    values (new.id, new.source_id, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.change_log(record_id, source_id, action, old_data)
    values (old.id, old.source_id, 'delete', to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists records_change_history on public.records;
create trigger records_change_history after insert or update or delete on public.records
for each row execute function public.log_record_changes();

-- Row-level security.
alter table public.data_sources enable row level security;
alter table public.records enable row level security;
alter table public.sync_runs enable row level security;
alter table public.change_log enable row level security;
alter table public.update_queue enable row level security;
alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.user_competitions enable row level security;
alter table public.points_history enable row level security;

-- Public profile fields are visible to signed-in leaderboard viewers.
drop policy if exists "Authenticated users can view leaderboard profiles" on public.profiles;
create policy "Authenticated users can view leaderboard profiles"
on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

revoke update on public.profiles from authenticated;
grant update (full_name, school, github_username) on public.profiles to authenticated;

drop policy if exists "Authenticated users can view competitions" on public.competitions;
create policy "Authenticated users can view competitions"
on public.competitions for select to authenticated using (true);

drop policy if exists "Users can view own participation" on public.user_competitions;
create policy "Users can view own participation"
on public.user_competitions for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can view own points history" on public.points_history;
create policy "Users can view own points history"
on public.points_history for select to authenticated using (auth.uid() = user_id);

-- Leaderboard view uses the caller's RLS permissions.
create or replace view public.leaderboard with (security_invoker = true) as
select id as user_id, full_name, school, points from public.profiles;
revoke all on public.leaderboard from public, anon;
grant select on public.leaderboard to authenticated;
create index if not exists profiles_points_idx on public.profiles(points desc);

-- Trusted backend-only point awarding.
create or replace function public.award_points(
  p_user_id uuid, p_points integer, p_reason text, p_competition_id uuid default null
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_points is null or p_points <= 0 then raise exception 'Points must be positive'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'A reason is required'; end if;
  update public.profiles set points = points + p_points where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
  insert into public.points_history(user_id, points, reason, competition_id)
  values (p_user_id, p_points, p_reason, p_competition_id);
end;
$$;
revoke all on function public.award_points(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.award_points(uuid, integer, text, uuid) to service_role;

-- Complete a participation and award points in one transaction.
create or replace function public.complete_competition(
  p_user_id uuid, p_competition_id uuid, p_points integer
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_points is null or p_points < 0 then raise exception 'Points cannot be negative'; end if;
  update public.user_competitions
  set status = 'completed', points_earned = p_points, completed_at = now()
  where user_id = p_user_id and competition_id = p_competition_id
    and status in ('registered', 'in_progress');
  if not found then raise exception 'Participation not found or already completed'; end if;
  update public.profiles set points = points + p_points where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
  if p_points > 0 then
    insert into public.points_history(user_id, points, reason, competition_id)
    values (p_user_id, p_points, 'Competition completed', p_competition_id);
  end if;
end;
$$;
revoke all on function public.complete_competition(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_competition(uuid, uuid, integer) to service_role;
