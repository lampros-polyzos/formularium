-- Passkeys (WebAuthn): sign in with a fingerprint, face or device PIN instead of a password. Safe to run twice.
--
-- passkeys holds what the server needs to CHECK a passkey later: the credential id and the PUBLIC key. The private key never leaves the member's
-- device, so a leaked copy of this table cannot be used to sign in. A member can have several (a phone, a laptop, a security key).
--
-- webauthn_challenges holds the one-time challenge of a passkey registration or sign-in that is under way, for five minutes. It is in the database,
-- not in memory, so that any instance of the backend can finish what another one started. A challenge is deleted the moment it is used.
--
-- Both are written by the backend only (it connects as the owner; the browser roles have no access).

create table if not exists public.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  credential_id text not null unique,          -- base64url, as the browser sends it
  public_key text not null,                    -- base64url of the COSE public key
  sign_count bigint not null default 0,        -- a counter some authenticators keep; going backwards means a cloned key
  name text not null check (char_length(name) between 1 and 60),
  backup_eligible boolean not null default false,   -- the passkey can sync between the member's devices (iCloud Keychain, a password manager...)
  backup_state boolean not null default false,      -- ...and currently does
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists passkeys_user_idx on public.passkeys (user_id);

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('register', 'login')),
  user_id uuid references public.app_users (id) on delete cascade,   -- who is registering; empty for a sign-in (the passkey says who)
  request_json text not null,                  -- the options sent to the browser, which the answer is checked against
  expires_at timestamptz not null
);

create index if not exists webauthn_challenges_expiry_idx on public.webauthn_challenges (expires_at);

alter table public.passkeys enable row level security;
alter table public.webauthn_challenges enable row level security;

-- Same rule as every other table: the browser roles (Supabase only) get nothing
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.passkeys from anon, authenticated;
    revoke all on public.webauthn_challenges from anon, authenticated;
  end if;
end $$;
