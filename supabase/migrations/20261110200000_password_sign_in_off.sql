-- Switching password sign-in off, for members who have a passkey. Safe to run twice.
--
-- An account with this set cannot be signed into with its password (a passkey, or Google if it is linked, still works). That is what makes it phishing-proof: a
-- fake site can relay a password and a code, but not a passkey. The date is when it was switched off; empty means password sign-in is on, as it is for everyone
-- today, so existing accounts are not touched.
--
-- A password reset by email switches it back on, so a member who has lost every device can still get in through their mailbox.

alter table public.app_users add column if not exists password_login_disabled_at timestamptz;
