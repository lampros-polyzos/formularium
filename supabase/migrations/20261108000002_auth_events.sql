-- Sign-in events: the audit trail of the account system, and the counters the login throttle reads.
-- Safe to run twice.
--
-- Written by the backend only (it connects as the owner; the browser roles have no access). It holds NO passwords and no raw email
-- addresses: the throttle needs "failures for this address", which is kept as a SHA-256 hash of the lower-cased email. The client
-- address and browser string are personal data, so they are exported with the account and purged after 90 days.
--
-- Types written by the backend: login_success, login_failed, google_login, register, email_verified, email_requested,
-- password_reset_requested, password_reset_done, refresh_reuse (an old refresh token came back: possible theft), and for two-step
-- verification: mfa_enabled, mfa_disabled, mfa_failed, mfa_login_success, recovery_code_used, recovery_codes_renewed.

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null,
  type text not null,
  email_hash text,
  ip text,
  user_id uuid references public.app_users (id) on delete set null,
  user_agent text
);

-- the throttle asks "how many failures for this email / this address in the last 15 minutes"
create index if not exists auth_events_email_idx on public.auth_events (type, email_hash, at);
create index if not exists auth_events_ip_idx on public.auth_events (type, ip, at);
-- "recent activity on this account", and the daily purge
create index if not exists auth_events_user_idx on public.auth_events (user_id, at desc);
create index if not exists auth_events_at_idx on public.auth_events (at);

alter table public.auth_events enable row level security;

-- Same rule as every other table: the browser roles (Supabase only) get nothing
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.auth_events from anon, authenticated;
  end if;
end $$;
