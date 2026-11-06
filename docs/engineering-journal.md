# Engineering journal

Problems that took real thinking, each in short Situation / Task / Action / Result form. Newest first.

## A secret reached the repository

- **Situation.** While adding SMTP settings, real credentials ended up in a tracked "example" settings file, and one of those commits was pushed.
- **Task.** Find out what had actually leaked, stop it happening again, and not pretend that deleting the lines fixed it.
- **Action.** Searched all of git history for each secret (four were pushed, the SMTP password was not), rewrote the tracked files to placeholders, moved the real values to a git-ignored file, and wrote a pre-commit hook that blocks any staged line containing a value from the ignored files or matching a known key shape (it reports file and line but never prints the secret). Checked the hook against real and fake secrets, and began rotating the exposed credentials at their providers.
- **Result.** The files are clean, and a commit that repeats the mistake is stopped locally. The old values stay exposed in git history, but every one was immediately rotated, because removing a secret from git does not make it safe, only rotating it does.

## Moving auth and data off Supabase without breaking the app

- **Situation.** Supabase handled sign-in, access policies, a dozen database triggers and several functions. I wanted all of that in my own Spring backend, with Supabase as only a database.
- **Task.** Do it without a long period where nothing works, and without losing the rules the triggers enforced.
- **Action.** Worked in slices (accounts, library, formulas, batches, community, export), each with Spring endpoints, Java tests for every ported rule, a migration removing the old database objects (tested on a real Postgres engine), and a switched frontend module. Wrote the plan and the trade-offs in [`spring-owns-auth-and-data.md`](spring-owns-auth-and-data.md).
- **Result.** The browser no longer has any database access, the rules are testable Java, and the final migration revokes the browser roles' privileges.

## Two tabs refreshing the same token

- **Situation.** Refresh tokens are single-use, so two browser tabs (or two parallel requests) renewing at once made one of them look like a stolen token and signed the person out.
- **Task.** Keep reuse detection, which is the point of rotation, without logging out people who just have two tabs open.
- **Action.** On the server, a token used within a 10-second grace period answers "just renewed, try again" instead of revoking the family; only a clearly old token triggers revocation. In the client, all parallel requests share one refresh, and a conflict is retried after a short wait.
- **Result.** Theft detection still works and multi-tab use does not sign anyone out. Both behaviours have tests.

## Deleting an account failed for anyone who had data

- **Situation.** Account deletion worked for new accounts and failed for people with a stash or containers.
- **Task.** Make deletion all-or-nothing and complete, without hand-maintaining a list of tables.
- **Action.** Found that several foreign keys to the user had no `on delete cascade`. Wrote a migration that finds every such key and recreates it with cascade, preserving whether it was validated, and made the data export use an explicit table list guarded by a test.
- **Result.** Deleting an account removes everything it owns in one step, and a new table with a person's id cannot be forgotten.

## Two batches overdrawing the same stash lot

- **Situation.** Making a batch deducts ingredients from stash lots. Two requests at once, or a stale screen, could take more than a lot holds.
- **Task.** Never let a lot go negative, and never leave a half-made batch.
- **Action.** Moved the logic into one transaction: each deduction is an update guarded by `amount_left_g >= grams`, and a failed guard rolls the whole batch back with a plain-language message. Costs are computed in the same transaction.
- **Result.** The invariant lives in the database operation itself, with a test that tries to overdraw.

## Same code, two databases

- **Situation.** Tests run on H2 for speed while production is PostgreSQL, and JSON columns behave differently (a `jsonb` cast is required on Postgres and breaks H2).
- **Task.** Keep fast tests without letting the two drift.
- **Action.** Added a tiny `Dialect` component that adds the cast only on Postgres, and kept SQL migrations separately tested on a real Postgres engine (PGlite).
- **Result.** Fast API tests and trustworthy migration tests, with one small, explicit point where the two differ.
