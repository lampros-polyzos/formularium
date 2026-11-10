# Roadmap

## Done

- Formula studio: phases, percentages, auto-balance, version history, autosave, import from text, one-click fixes
- Server-side validation rules (totals, usage limits, pH, product type, interactions, preservation, stability) and EU limits (Regulation 1223/2009, Annexes III and V)
- Batches with atomic stash deduction, costs, check-ins and bench mode
- PDF exports: product information file, batch record, batch ticket, shopping list, sourcing guide
- Community: posts, comments, recipe versions and remixes, ratings, reports, muting, moderation, notifications
- Own authentication: JWT access tokens, rotating refresh cookie, Google sign-in, bot check, email confirmation, password reset
- Data export and account deletion
- Supabase reduced to a plain PostgreSQL host; every rule moved to tested Java ([ADR 0008](decisions/0008-move-to-spring-in-slices.md))
- Sign-in hardening for real users: three-layer throttling in the database, leaked-password rejection, an audit trail, Dependabot and CodeQL ([ADR 0010](decisions/0010-keep-own-authentication-and-harden-it.md))
- Two-step verification with an authenticator app, recovery codes and an enrollment screen ([ADR 0011](decisions/0011-two-step-verification-with-an-authenticator-app.md))
- A baseline migration, so a database can be built from nothing, and API tests that run on a database built from it
- Secret-leak protection: a pre-commit check that blocks staged secrets
- Screenshots and a demo GIF in the README
- Docker image for the backend, Render and Vercel configuration, and a step-by-step [deploy guide](deploy.md)
- **Change password while signed in**: needs the current password, signs out every other device but keeps this one, and emails a notice
- **Admin tool**: administrators (rows added by hand) look a member up, give or take away moderator rights, and do the recovery steps that needed SQL (switch off two-step verification, remove passkeys, switch password sign-in back on, sign out every device); each needs the administrator's password and a reason, is audited and emailed to the member ([ADR 0017](decisions/0017-an-admin-tool-for-recovery-and-moderators.md))
- **Alerts for a sign-in from a new browser**: an email with when, which browser, network address and how, for every way of signing in; the first browser is learnt silently and the email is capped per day ([ADR 0016](decisions/0016-alerts-for-sign-ins-from-a-new-browser.md))
- **Passkey autofill**: on the sign-in form, clicking the email box offers the saved passkeys in the browser's autofill list; it renews itself before the server's challenge expires and never fights the "Sign in with a passkey" button ([ADR 0014](decisions/0014-passkeys-as-a-full-sign-in.md))
- **Switch password sign-in off**: an account with a passkey that has signed in can refuse its own password, which closes the one path a fake site can still use; it cannot lock the owner out ([ADR 0015](decisions/0015-password-sign-in-can-be-switched-off.md))
- **Passkeys (WebAuthn)**: sign in with a fingerprint, face or screen lock, nothing typed; phishing-resistant, replaces the password and the authenticator code, managed in Settings ([ADR 0014](decisions/0014-passkeys-as-a-full-sign-in.md))
- **"Try the demo"**: one press makes a private, temporary guest account (deleted after a day), so a visitor can look around without signing up ([ADR 0013](decisions/0013-guest-sessions-for-the-demo.md))
- **Live at [formularium.dev](https://formularium.dev)**: website on Vercel, API on Render (`api.formularium.dev`), PostgreSQL on Supabase, DNSSEC, email through Brevo, with the sign-in limits counting the visitor's real address

## Next

1. **Passkey check in Safari and Firefox**, including choosing a passkey from the autofill popup, which headless testing cannot do
2. **A list of the browsers an account is signed in from** (the alerts already know them), with a button to sign one out, and a way to **rotate the two-step encryption key**
3. **Browser end-to-end tests** for the main flows: sign up, make a formula, make a batch
4. **CodeQL for the Java backend** (it scans the frontend only for now)
5. **Clear the lint warnings**: 14 effects that set state or load data directly (`react-hooks/set-state-in-effect`) and one mutation in the cost calculator, reported as warnings until reworked

## Known limitations

- Notifications are fetched every 30 seconds; there is no push.
- Regional limits cover the EU only.
- Administrators are made only by inserting a row in `app_admins`, on purpose; there is one, and the tool does not act on administrator accounts.
- `unique_inci_name` makes an INCI name unique across the library, so a powder and a solution of the same ingredient cannot both be rows.
- Copying a community recipe leaves out lines that use another member's private ingredient; the copy is still made.
- Accounts from the earlier Supabase-auth days were not imported (a fresh start was chosen).
- The app supports a formulator's own safety checks. It is **not** a substitute for a professional safety assessment.
