-- Accounts now live in the app's own tables and are managed by the Spring backend, not by Supabase Auth.
--
--   app_users       one row per account: email, password hash (empty for Google-only accounts), Google id, username
--   refresh_tokens  long-lived sign-in tokens, stored only as a SHA-256 hash, grouped in "families" so a stolen token can be spotted
--
-- Every foreign key from this app's own tables (schema public) that pointed at Supabase's internal user table (auth.users) is moved to
-- app_users, found automatically so no constraint names have to be known. Supabase's own tables are not touched. The new constraints are NOT VALID: rows that belong to old Supabase accounts are kept (nothing
-- is deleted) but nothing new can point at a user that does not exist. Delete those rows yourself once you are sure they are not needed.
--
-- Row-level security is switched on with no policies: the browser's anonymous and signed-in roles can no longer read or write these tables
-- through Supabase. Only the Spring backend, which connects with the database owner's credentials, can.
--
-- Safe to run more than once.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  google_sub text unique,
  username text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Emails and usernames are unique ignoring upper/lower case
create unique index if not exists app_users_email_key on public.app_users (lower(email));
create unique index if not exists app_users_username_key on public.app_users (lower(username));

create table if not exists public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  family_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);
create index if not exists refresh_tokens_user_idx on public.refresh_tokens (user_id);
create index if not exists refresh_tokens_family_idx on public.refresh_tokens (family_id);

alter table public.app_users enable row level security;
alter table public.refresh_tokens enable row level security;

-- Move every single-column foreign key that references auth.users to app_users
do $$
declare
  r record;
  action text;
begin
  if to_regclass('auth.users') is null then
    return;
  end if;
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname, c.confdeltype
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and array_length(c.conkey, 1) = 1
       and n.nspname = 'public'   -- only this app's tables: Supabase's own (auth.identities, auth.sessions...) belong to Supabase and stay as they are
  loop
    action := case r.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' when 'r' then 'restrict' else 'no action' end;
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.app_users (id) on delete %s not valid', r.tbl, r.conname, r.attname, action);
  end loop;
end $$;
