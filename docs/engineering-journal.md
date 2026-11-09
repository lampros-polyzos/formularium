# Engineering journal

Problems that took real thinking, each in short Situation / Task / Action / Result form. Newest first. Each entry is dated by the commit where the fix landed.

## 2026-11-10: A sign-in that a fake site cannot relay

- **Situation.** Two-step verification stopped stolen passwords, but a fake website can pass a password and a six-digit code to the real one in real time. That gap was written down as the biggest remaining one.
- **Task.** Add the one credential that is bound to the site's domain (a passkey), without writing cryptographic verification by hand and without breaking the existing sign-in.
- **Action.** Chose passkeys as a full sign-in next to the password (a passkey is device plus fingerprint or PIN, so it counts for both steps and skips the code), kept the password as the recovery path, and used Yubico's reference library instead of parsing authenticator data myself. The decisions that matter more than the wiring: challenges live in the database and are deleted as they are read, so each works once and any instance can finish another's; adding or removing a passkey needs the password, as MFA setup does; a counter that goes backwards refuses the sign-in; a guest cannot add one. To test the part that is easy to get wrong, I wrote a software authenticator (a key pair, the CBOR and COSE bytes the standard defines, signatures) that can also lie: a look-alike origin, a damaged or foreign signature, a missing fingerprint, a replayed challenge, a copied key. The unit tests would have passed against my own wrong assumptions, so I also ran the whole flow in a real browser engine with a virtual authenticator, against a throwaway database and servers started only for the check.
- **Result.** 26 backend tests, 9 for the migration and 29 for the client, the settings screen and the sign-in form, plus a 12-step browser run that adds a passkey, signs out and signs in with nothing typed. Honest limits, written into [ADR 0014](decisions/0014-passkeys-as-a-full-sign-in.md): passwords stay valid and phishable until an account can switch them off, a synced passkey is only as safe as the cloud account behind it, and only Chromium was run against a virtual authenticator.

## 2026-11-10: A demo nobody has to sign up for

- **Situation.** The app was live, but the only way in was to create an account, confirm an email and choose a password. Nobody reviewing a portfolio will do that, so the best features would go unseen.
- **Task.** Let a visitor try the real app in one click, without opening the public site to abuse or to each other's data.
- **Action.** Rejected a shared demo login (shared mess, anyone can change its password or spam the community) and a read-only one (hides the best parts). Each press now creates a private account that expires: the same account system, with a `guest_expires_at` column, no password and an address under `guest.invalid`. Because it is open to everyone it is limited three ways (the bot check, 10 per address per hour, 200 at once) and restricted in one place: a `guest` claim in the token, and two rules in the security configuration that refuse community writes and two-step setup with a clear message. An hourly job deletes expired guests, and an expired guest cannot renew even before that. The new column is read by every user query, so the migration has to be applied before the code (the decision in ADR 0012 earning its keep).
- **Result.** 13 backend tests (limits, restrictions, expiry, the cleanup, and that real members are not affected), 5 for the migration on a real Postgres engine and 16 for the button, the banner, the sign-in form, the landing page and the client. What it does not do is keep a guest's work when they sign up, and a determined bot with many addresses could still fill the 200 places ([ADR 0013](decisions/0013-guest-sessions-for-the-demo.md)).

## 2026-11-09: The limit that anyone could walk around

- **Situation.** The sign-in limits count attempts per client address. Behind Render's proxy the app learned that address from `X-Forwarded-For`, through Spring's forwarded-header support. The production audit trail showed real addresses, so it looked right.
- **Task.** Find out whether a visitor could choose the address the limits see.
- **Action.** Read it from the framework instead of trusting it: a one-class test showed Spring takes the first entry of `X-Forwarded-For`, which is the entry the visitor writes. A temporary endpoint on the live API then showed the same on Render, and showed that `True-Client-IP` is overwritten by the edge and `CF-Connecting-IP` cannot be sent at all. The fix reads the address from one configured header (`CLIENT_IP_HEADER`), ignores `X-Forwarded-For` completely, accepts only a single address, and falls back to the connection's own address. Dropping the forwarded-header setting also removed the HTTPS signal the HSTS header depended on, so HSTS is now sent explicitly.
- **Result.** Changing `X-Forwarded-For` no longer changes the counted address, in the unit tests and through the endpoints (12 forged requests still hit the email limit). The account-level limits never depended on the address, so password guessing against one account was capped throughout.

## 2026-11-08: A second factor without a vendor

- **Situation.** The hardening left one large gap: a leaked or guessed password was still enough to take over an account, and the app was going to real users with no money for a provider.
- **Task.** Add two-step verification that costs nothing, needs no phone number and fits the existing sign-in, including Google sign-in.
- **Action.** Chose authenticator-app codes (TOTP) and wrote the algorithm on the standard library, verified against the RFC 6238 test vectors. Made the design decisions that matter more than the maths: the secret is encrypted at rest with its own key (not derived from the token secret, so routine rotation cannot break everyone); a code is single-use through a conditional `UPDATE`, so two racing requests cannot both win; a right password returns a one-time challenge stored hashed (not a JWT, so it can never pass as an access token) and no cookie, and the session only exists after the code; Google sign-in goes through the same step; setting up needs the password, so a stolen access token cannot bind the account to an attacker's phone; a password reset does not switch it off. Added recovery codes (hashed, shown once), an enrollment screen with a QR code rendered in the browser (the secret never goes to a third party), and throttling of code guesses.
- **Result.** 28 backend and 27 frontend tests cover it, including replay, expiry, brute force, the swapped-ciphertext case and the "no key configured" case. The trade-offs are written down: there is no self-service recovery when the phone and the codes are both lost (an operator procedure instead), the key cannot be rotated yet, and phishing needs passkeys ([ADR 0011](decisions/0011-two-step-verification-with-an-authenticator-app.md)).

## 2026-11-08: Sign-in that is safe enough for real users, for free

- **Situation.** The app was heading for real users, with no money for an identity provider, so "don't roll your own auth" had to be answered with evidence, not a shrug.
- **Task.** Find out what was actually weak in the own-built sign-in and fix what matters, without adding cost.
- **Action.** Read the code against a production threat model and found five gaps: login throttling lived in memory and only covered one account from one address (so rotating addresses, or one password across many accounts, got through, and a restart or second instance reset it); no check for leaked passwords; no audit trail; a 72-limit that counted characters while bcrypt counts bytes; and a doubt about the cookie endpoints that turned out to be unfounded, because Spring's CORS handling already refuses a foreign origin (a test now proves it, and the guard I had written was deleted). Fixed the rest: a database table that serves as both the audit trail and the throttle's counters (three layers, shared across instances), the free Pwned Passwords range check with k-anonymity that fails open, byte-length validation, an email-request limit per address, and 90-day retention with the events shown in the account export and the privacy policy. Added Dependabot, CodeQL and a security policy, and wrote the decision and the known gaps down ([ADR 0010](decisions/0010-keep-own-authentication-and-harden-it.md), [docs/security.md](security.md)).
- **Result.** The main attacks on a password sign-in each have a control and a test. MFA is still missing and is stated as the biggest remaining gap. Also learned: a test that wipes the table it needs to check silently passes for the wrong reason, so each throttling test now builds its account first.

## 2026-11-07: Nobody could build the database

- **Situation.** The migrations were small changes on top of a schema first made by clicking in the Supabase dashboard, so there was no way to create the database from nothing. The backend tests ran on a hand-kept copy of the tables that had quietly drifted from production.
- **Task.** Capture the real schema as a baseline, and make the tests use it instead of a copy.
- **Action.** Dumped the production schema with `pg_dump` (read-only) and cleaned it: left out 15 old policies that called Supabase's `auth.uid()`, six `user_id` defaults that pointed at it, and Supabase's own helper function, so the file runs on plain PostgreSQL. Generated the shared ingredients and product types as a second file. Then proved it three ways: built a fresh PostgreSQL from only those files and diffed its schema against production (only the intended differences remained), compared an md5 of every reference row between the two, and applied a small follow-up migration to a copy of production's schema to confirm it ends up identical to the baseline. The tests now start from those same files.
- **Result.** A new machine can build the database in one command, and the test database cannot drift because it is the production schema. Building it for real found things the hand-kept copy hid: a case-insensitive unique index on emails, 8 product types instead of 3, and the old policies still sitting in production.

## 2026-11-07: Logged out by a hiccup

- **Situation.** After auth moved into the backend, the app kept failing to autosave and load recipes, and signed people out "after a while".
- **Task.** Find out whether it was the sign-in design or something under it.
- **Action.** Reading the code showed two causes. The client treated *any* failed token renewal other than a lost connection as "signed out", so one 500 or 429 ended the session. And the database URL used the Supabase transaction pooler (port 6543), where the driver's prepared statements fail at random, which was producing those 500s in the first place. I switched to the session pooler (port 5432), set a small pool that recycles connections before the pooler drops them, made the client sign out only on a real 401 and retry otherwise, and made it renew the token a minute before expiry and again when the tab wakes up or the network returns. A related race showed up next: the page's first "am I already signed in?" check could answer "no" after the person had just signed in, and wiped the new session until a reload. Every change to the session now bumps a counter, and a slow answer about an older state is ignored.
- **Result.** A flaky server no longer ends a session, and the first save after being away does not meet an expired token. Each behaviour has a test, including "a 503 must not sign you out". The lesson: a random failure that looks like an auth bug can sit one layer lower.

## 2026-11-07: Tests that passed on a database I don't run

- **Situation.** The API tests ran on H2 in PostgreSQL mode while production is PostgreSQL. Every gap needed a workaround (a `Dialect` class existed only to add a `jsonb` cast on one of the two), and a green test only proved the SQL worked on H2.
- **Task.** Make a passing test mean something about production, without making the suite painful to run.
- **Action.** Switched the Spring tests to a PostgreSQL 17 container (Testcontainers), shared by the whole run and started once, and deleted H2 and `Dialect`. The first run passed 225 of 235 tests. The 10 failures were all H2-only SQL inside the tests (`random_uuid()`, `merge ... key`, an upper-case constraint name), and one of them left a product type deleted, which caused most of the rest.
- **Result.** The suite needs Docker, but the tests now check the engine that runs in production ([ADR 0009](decisions/0009-api-tests-on-real-postgresql.md)). Migrations keep their own tests on a real Postgres engine (PGlite).

## 2026-11-06: A secret reached the repository

- **Situation.** While adding SMTP settings, real credentials ended up in a tracked "example" settings file, and one of those commits was pushed.
- **Task.** Find out what had actually leaked, stop it happening again, and not pretend that deleting the lines fixed it.
- **Action.** Rotated every exposed credential at its provider the moment I found the commit, before anything else, because removing a secret from git does not make it safe, only replacing it does. Then searched all of git history for each secret (four were pushed, the SMTP password was not), rewrote the tracked files to placeholders, moved the real values to a git-ignored file, and wrote a pre-commit hook that blocks any staged line containing a value from the ignored files or matching a known key shape (it reports file and line but never prints the secret). Checked the hook against real and fake secrets.
- **Result.** The old values are still readable in git history, but they no longer work, since all of them had already been replaced. The files are clean, and a commit that repeats the mistake is stopped locally.

## 2026-11-06: Two batches overdrawing the same stash lot

- **Situation.** Making a batch deducts ingredients from stash lots. Two requests at once, or a stale screen, could take more than a lot holds.
- **Task.** Never let a lot go negative, and never leave a half-made batch.
- **Action.** Moved the logic into one transaction: each deduction is an update guarded by `amount_left_g >= grams`, and a failed guard rolls the whole batch back with a plain-language message. Costs are computed in the same transaction.
- **Result.** The invariant lives in the database operation itself, with a test that tries to overdraw.

## 2026-11-06: Everyone could read everyone's custom ingredients

- **Situation.** While porting the ingredient queries I found that the old database policy "Allow read access for all users" matched every row, so any visitor, signed in or not, could read other people's private custom ingredients.
- **Task.** Fix the leak as part of the move, not as a separate patch.
- **Action.** The backend returns only shared ingredients and the caller's own, with the owner condition in the SQL, and a test reads the list as a second member.
- **Result.** Private ingredients stay private, and the rule is readable Java ([ADR 0005](decisions/0005-authorization-in-java.md)).

## 2026-11-06: Deleting an account failed for anyone who had data

- **Situation.** Account deletion worked for new accounts and failed for people with a stash or containers.
- **Task.** Make deletion all-or-nothing and complete, without hand-maintaining a list of tables.
- **Action.** Found that several foreign keys to the user had no `on delete cascade`. Wrote a migration that finds every such key and recreates it with cascade, preserving whether it was validated, and made the data export use an explicit table list guarded by a test.
- **Result.** Deleting an account removes everything it owns in one step, and a new table with a person's id cannot be forgotten.

## 2026-11-06: Two tabs refreshing the same token

- **Situation.** Refresh tokens are single-use, so two browser tabs (or two parallel requests) renewing at once made one of them look like a stolen token and signed the person out.
- **Task.** Keep reuse detection, which is the point of rotation, without logging out people who just have two tabs open.
- **Action.** On the server, a token used within a 10-second grace period answers "just renewed, try again" instead of revoking the family; only a clearly old token triggers revocation. In the client, all parallel requests share one refresh, and a conflict is retried after a short wait.
- **Result.** Theft detection still works and multi-tab use does not sign anyone out. Both behaviours have tests.

## 2026-11-06: Moving auth and data off Supabase without breaking the app

- **Situation.** Supabase handled sign-in, access policies, a dozen database triggers and several functions. I wanted all of that in my own Spring backend, with Supabase as only a database.
- **Task.** Do it without a long period where nothing works, and without losing the rules the triggers enforced.
- **Action.** Worked in slices (accounts, library, formulas, batches, community, export), each with Spring endpoints, Java tests for every ported rule, a migration removing the old database objects (tested on a real Postgres engine), and a switched frontend module. The plan is in [ADR 0008](decisions/0008-move-to-spring-in-slices.md).
- **Result.** The browser no longer has any database access, the rules are testable Java, and the final migration revokes the browser roles' privileges.
