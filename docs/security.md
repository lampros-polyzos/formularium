# Security

How sign-in and accounts are protected, what is not covered, and what to do when running it. The reasoning is in [ADR 0003](decisions/0003-own-authentication.md) and [ADR 0010](decisions/0010-keep-own-authentication-and-harden-it.md). To report a problem, see [SECURITY.md](../SECURITY.md).

## What protects what

| Threat | Control |
|---|---|
| Guessing one account's password | 5 failures per account and address in 15 minutes, and 20 per account from any address. A right password clears the count for that address only |
| Trying one password on many accounts | 30 failures per address in 15 minutes |
| Bots | Cloudflare Turnstile on sign-up, sign-in and the email forms |
| A weak or leaked password | At least 10 characters, and refused if it appears in a known data breach (Pwned Passwords range service; only a 5-character hash prefix is sent) |
| Stolen database | Passwords are bcrypt (cost 12). Refresh tokens and email links are stored only as SHA-256 hashes |
| A leaked or guessed password | Optional two-step verification: after the password, a 6-digit code from an authenticator app (or a recovery code). Covers Google sign-in too. A code works once; wrong codes are limited to 5 per sign-in, 10 per account and 30 per address in 15 minutes |
| Stolen access token | Valid 15 minutes, kept only in browser memory. It cannot set up, change or turn off two-step verification: that needs the password or a code |
| Stolen refresh token | Single use, rotated on every renewal. If an old one comes back, the whole sign-in is ended and the event is recorded. A 10-second grace window covers two tabs renewing at once |
| Another website acting on a member's cookie | The refresh cookie is `HttpOnly`, `Secure` in production, scoped to `/api/v1/auth` and `SameSite`. Spring's CORS handling also refuses any request that names a foreign `Origin`, so the cookie is never used for it |
| Finding out who has an account | The same answer for known and unknown emails at sign-in, password reset and resend, and a decoy hash so timing does not tell either |
| Flooding inboxes through the email forms | 10 confirmation or reset requests per address per hour, plus one per account per minute |
| Taking over an account from an open or stolen session | Changing the password needs the current one (wrong ones: 10 per account and 30 per address in 15 minutes), applies the sign-up rules to the new one, ends every OTHER sign-in while keeping the one in use, cancels a waiting reset link and emails the account a notice. An account that only uses Google cannot set a first password from a session: it uses "Forgot your password?", which proves the address by email |
| Taking over an account through email | Links are 256-bit random, single use, expire (1 hour for resets, 24 for confirmation), and a reset signs the account out everywhere |
| Reading other members' data | The caller's id comes from the verified token and is part of every query ([ADR 0005](decisions/0005-authorization-in-java.md)); each endpoint is tested as a second member |
| Direct database access from the browser | The browser roles have no privileges, and row-level security is on with no policies |
| Leaked secrets in git | A pre-commit hook blocks them. GitHub push protection is a second layer, but it only knows the formats of well-known secrets (an OAuth client secret, many API keys), not a database or mail password, so the hook stays essential |
| Phishing: a fake site relaying a password and a code | A passkey is bound to the website's own domain: the browser offers it only to pages of that domain, and what it signs names the site, so a relay through a look-alike fails. It protects the sign-ins that use a passkey, and an account can switch password sign-in off to close the password path ([ADR 0014](decisions/0014-passkeys-as-a-full-sign-in.md), [ADR 0015](decisions/0015-password-sign-in-can-be-switched-off.md)) |
| Locking yourself out, or someone closing you out, with "password sign-in off" | Switching off needs the password and a passkey that has signed in before (one never used might not work); it signs out every other device and emails a notice; the last passkey known to work cannot be removed while it is off; and a password reset by email switches it back on |
| Binding someone else's device to an account | Adding or removing a passkey needs the account password (wrong ones are limited per account and per address), is refused for guests, is capped at 10 per member and is recorded in the audit trail |
| Abuse of "Try the demo" ([ADR 0013](decisions/0013-guest-sessions-for-the-demo.md)) | The same bot check as sign-up; 10 demos per address per hour; at most 200 guests at once; each guest is deleted after 24 hours with everything it made. A guest can read the community but not write to it, and cannot set up two-step verification (the API answers `403 guest_account`). `GUEST_ENABLED=false` switches it off |
| Vulnerable libraries | Dependabot opens weekly update pull requests; CodeQL scans the frontend code |

Every sign-in, failure, reset, confirmation and replayed token is recorded in `auth_events` without passwords or raw email addresses, kept 90 days, and included in the member's data export.

## Known gaps

- **Two-step verification is optional**, and a code does not stop phishing: a fake site can relay it in real time.
- **Switching password sign-in off is opt-in, and only about the password.** Until a member does it, their password (with its code) can still be phished. Google sign-in, if linked, stays a way in. And the mailbox is a way back in: a password reset by email switches password sign-in back on, so whoever controls the mailbox can undo it.
- **A passkey that syncs is as safe as the account that syncs it** (Apple, Google, a password manager), and a passkey skips two-step verification altogether.
- **We do not check what kind of device made a passkey** (attestation is off), and the relying party id is fixed: moving the site to another domain makes every passkey stop working.
- **Losing both the phone and the recovery codes locks the account out of self-service.** On purpose, as a self-service path would be the weak point. See "Helping someone who is locked out" below.
- **The two-step encryption key cannot be rotated yet** (see the roadmap). Losing it means every member's authenticator stops working.
- **The notice about a password change goes to the address on the account**, so it helps only if that mailbox is still the owner's. A changed email address is not a feature yet.
- **No alert for a sign-in from a new device.**
- **The signing key is one shared secret (HS256).** That is fine while only this backend checks tokens. Rotating it is cheap: access tokens last 15 minutes and sessions live in the database, so a rotation only makes clients renew once. There is no support for two keys at the same time.
- **Locking out a victim.** The per-account limit means someone can block a member's sign-in for 15 minutes by failing on purpose. The bot check and the short window are what keep this costly.
- **Sign-up still says "already in use"** for an existing email, a deliberate choice for a clearer message ([ADR 0007](decisions/0007-email-confirmation-required.md)).
- **The demo can be crowded out.** Someone who solves the bot check many times from many addresses could fill the 200 places and show other visitors "busy". The ceiling protects the database; `GUEST_MAX_ACTIVE`, `GUEST_PER_IP_PER_HOUR` and the off switch are the tools. A guest has no quota on how much it saves during its day, and an office behind one address shares the per-address limit.
- **CodeQL does not scan the Java backend yet.**

## Running it: checklist

Before the first real user:
- **Secrets.** Set `AUTH_JWT_SECRET` (32+ random characters), `AUTH_COOKIE_SECURE=true`, and `AUTH_COOKIE_SAMESITE` (`Lax` if site and API share a domain, `None` if not). Keep real values out of git; they belong in `backend/.env` or the host's environment.
- **Rotate after any exposure.** Replace the secret at its provider, then in the host. Rotating `AUTH_JWT_SECRET` signs nobody out for good: clients renew by themselves.
- **Email.** Use a sending domain you control and set up **SPF, DKIM and DMARC** for it, or confirmation and reset links will land in spam. Keep `AUTH_REQUIRE_VERIFIED_EMAIL=true`.
- **HTTPS everywhere, and the real client address.** The per-address limits and the audit trail count the address in the header named by `CLIENT_IP_HEADER` (Render: `CF-Connecting-IP`), never `X-Forwarded-For`, which a visitor can write: Render appends to it instead of replacing it, so the first entry is whatever the visitor sent. Check it on the live API after any change of host: send a request with a forged `X-Forwarded-For` and confirm the address the app counts is still yours. The backend must be reachable **only** through the proxy that sets the header. Without `CLIENT_IP_HEADER` the connection's own address is used, which is safe but, behind a proxy, is the same for everyone.
- **Turnstile** keys set on both sides (`TURNSTILE_SECRET`, `VITE_TURNSTILE_SITE_KEY`).
- **Accounts.** Turn on two-step verification for the GitHub, Supabase, Google Cloud, Cloudflare and mail-provider accounts that can reach production.
- **GitHub settings** (free), in this repository's Settings, under Code security (also called Advanced Security): turn on *Dependency graph*, *Dependabot alerts* and *security updates*, *Private vulnerability reporting*, and *Secret scanning* with *Push protection*. The account-level Code security page only sets defaults for NEW repositories (use its *Enable all* buttons for existing ones), apart from *Push protection for yourself*, which covers all your public repositories. Keep that one on.
- **Backups.** Check that the database host keeps backups, and that you have restored one at least once.
- **Passkeys.** Set `WEBAUTHN_RP_ID` (the website's domain) and `WEBAUTHN_ORIGINS` (its exact address) before anyone adds a passkey, and never change them afterwards: production is `formularium.dev` and `https://formularium.dev`. `PASSKEYS_ENABLED=false` switches the feature off.
- **Two-step verification key.** Create `AUTH_MFA_ENCRYPTION_KEY` once (`openssl rand -base64 32`), keep it apart from `AUTH_JWT_SECRET`, and **back it up** with your other secrets: authenticator secrets are encrypted with it. Leave it empty and the feature is simply off.
- **The demo.** On by default. Apply its migration before deploying the code that needs it. The settings are `GUEST_ENABLED`, `GUEST_TTL_HOURS` (24), `GUEST_MAX_ACTIVE` (200) and `GUEST_PER_IP_PER_HOUR` (10).
- **Database.** The backend must connect as the table owner, never as `anon` or `authenticated`, and the migrations in `supabase/migrations` must all be applied.

## Helping someone who is locked out

If a member has lost both their phone and their recovery codes, first make sure the request really comes from them (for example, from the email address on the account, and a question only they can answer). Then switch two-step verification off for that account only, in the SQL editor:

```sql
-- replace the address; check that it returns one row first
select id from app_users where email = 'member@example.com';

delete from mfa_recovery_codes where user_id = '<that id>';
delete from mfa_challenges     where user_id = '<that id>';
delete from user_mfa           where user_id = '<that id>';
```

They can sign in with their password again and set it up afresh. The event is not recorded automatically, so note it down.

A member who switched password sign-in off and has lost every passkey normally gets back in with "Forgot your password?", whose emailed link switches it back on. If they cannot use their mailbox either, switch it back on for them, once you are sure it is them (it is recorded nowhere, so note it down):

```sql
update app_users set password_login_disabled_at = null where id = '<that id>';
```

A member who has lost a device with a passkey on it can still sign in with their password (or Google). To make a lost device's passkey stop working when they cannot sign in to remove it themselves, delete it in the same way (it is recorded nowhere, so note it down):

```sql
delete from passkeys where user_id = '<that id>';   -- all of them; add  and id = '<passkey id>'  for one
```
