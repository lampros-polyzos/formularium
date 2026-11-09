-- Guest (demo) accounts: a visitor presses "Try the demo" and gets a private, temporary account, so nobody has to sign up to look around.
-- Safe to run twice.
--
-- A guest is an ordinary row of app_users with an expiry date. It has no password and an address that can never receive mail
-- (guest-<random>@guest.invalid), so it cannot be signed into again once its session is gone. When the date passes, the backend deletes the
-- row, and every foreign key to app_users is "on delete cascade", so the guest's formulas, stash and batches go with it.

alter table public.app_users add column if not exists guest_expires_at timestamptz;

-- "which guests have expired" and "how many guests exist" only ever look at guests
create index if not exists app_users_guest_expiry_idx on public.app_users (guest_expires_at) where guest_expires_at is not null;
