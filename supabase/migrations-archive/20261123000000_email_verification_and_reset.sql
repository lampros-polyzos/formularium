-- Email confirmation and password reset, handled by the Spring backend.
--
--   app_users.email_verified_at   when the address was confirmed (empty = not confirmed yet)
--   email_tokens                  the one-time links sent by email, for confirming an address ("verify") and choosing a new password ("reset").
--                                 Only a SHA-256 hash of each link's token is stored, so a copy of the table cannot be used to take over an account.
--
-- Accounts that already exist are marked as confirmed, so nobody is locked out the day this goes live. This happens only when the column is
-- first added: running the file again never confirms an account that is waiting for its link.
--
-- Row-level security is on with no policies: only the backend can reach these tables.
--
-- Safe to run more than once.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_users' and column_name = 'email_verified_at') then
    alter table public.app_users add column email_verified_at timestamptz;
    update public.app_users set email_verified_at = coalesce(created_at, now());
  end if;
end
$$;

create table if not exists public.email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists email_tokens_user_idx on public.email_tokens (user_id, purpose);
create index if not exists email_tokens_expires_idx on public.email_tokens (expires_at);

alter table public.email_tokens enable row level security;
