-- Two-step verification (authenticator-app codes) and the one-time challenge that sits between a correct password and a session.
-- Safe to run twice. Written by the backend only; the browser roles have no access.
--
--   user_mfa            one row per member who has started or finished setting it up. The TOTP secret is stored ENCRYPTED (AES-GCM, key from the
--                       server's settings, bound to the member's id), never in plain text. Pending until enabled_at is set.
--                       last_used_step is the 30-second time step of the last accepted code: a code can only be used once.
--   mfa_recovery_codes  single-use codes for a lost phone. Only a SHA-256 hash is kept; the codes themselves are shown once.
--   mfa_challenges      "the password was right, now give the code": a random one-time token (stored hashed), valid 5 minutes, with a count of
--                       wrong tries. Used up (deleted) by a correct code.

create table if not exists public.user_mfa (
  user_id uuid primary key references public.app_users (id) on delete cascade,
  secret_encrypted text not null,
  created_at timestamptz not null,
  enabled_at timestamptz,
  last_used_step bigint not null default 0
);

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  unique (user_id, code_hash)
);

create table if not exists public.mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);
create index if not exists mfa_challenges_expires_idx on public.mfa_challenges (expires_at);
create index if not exists mfa_challenges_user_idx on public.mfa_challenges (user_id);

alter table public.user_mfa enable row level security;
alter table public.mfa_recovery_codes enable row level security;
alter table public.mfa_challenges enable row level security;

-- Same rule as every other table: the browser roles (Supabase only) get nothing
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.user_mfa, public.mfa_recovery_codes, public.mfa_challenges from anon, authenticated;
  end if;
end $$;
