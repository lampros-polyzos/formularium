-- The admin tool: who is an administrator, and a record of everything an administrator does to another member's account. Safe to run twice.
--
-- app_admins is filled ONLY by hand, in the SQL editor (see docs/security.md). The tool itself can never add an administrator, so a hijacked admin session cannot
-- create more of them. Removing a row removes the rights at once: the backend asks this table on every request.
--
-- admin_actions is the audit trail. It keeps the e-mail address of the administrator and of the member AS THEY WERE, next to their ids, so the record still reads
-- correctly after either account is deleted (the ids are then emptied). Kept two years, then purged by the backend. The affected member is told by email at the time.
--
-- Written by the backend only (it connects as the owner; the browser roles have no access).

create table if not exists public.app_admins (
  user_id uuid primary key references public.app_users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.app_users (id) on delete set null,
  admin_email text not null,
  target_user_id uuid references public.app_users (id) on delete set null,
  target_email text not null,
  action text not null check (action in ('view_member', 'grant_moderator', 'revoke_moderator', 'reset_two_step', 'remove_passkeys', 'restore_password_sign_in', 'sign_out_everywhere')),
  reason text not null,
  created_at timestamptz not null default now()
);

-- "everything done to this member", the hourly cap per administrator, and the purge
create index if not exists admin_actions_target_idx on public.admin_actions (target_user_id, created_at desc);
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_id, created_at desc);
create index if not exists admin_actions_created_idx on public.admin_actions (created_at);

alter table public.app_admins enable row level security;
alter table public.admin_actions enable row level security;

-- Same rule as every other table: the browser roles (Supabase only) get nothing
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.app_admins from anon, authenticated;
    revoke all on public.admin_actions from anon, authenticated;
  end if;
end $$;
