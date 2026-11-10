-- Browsers an account has signed in from, so that a sign-in from one we have not seen before can be reported to the account's owner by email. Safe to run twice.
--
-- A browser is recognised by a random identifier it keeps in a cookie after a sign-in. Only a SHA-256 hash of it is stored here, so a copy of this table cannot be
-- used to pass for a known browser. One browser used for two accounts has one row per account. The address of a sign-in is not kept here: it is in auth_events,
-- which is purged after 90 days. Rows not seen for 400 days (the longest a browser keeps such a cookie) are removed by the backend.
--
-- Written by the backend only (it connects as the owner; the browser roles have no access).

create table if not exists public.known_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  device_hash text not null,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

-- the daily purge of browsers that have not been seen for a long time
create index if not exists known_devices_seen_idx on public.known_devices (last_seen_at);

alter table public.known_devices enable row level security;

-- Same rule as every other table: the browser roles (Supabase only) get nothing
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.known_devices from anon, authenticated;
  end if;
end $$;
