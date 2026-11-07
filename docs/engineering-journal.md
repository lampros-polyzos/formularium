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
- **Action.** Worked in slices (accounts, library, formulas, batches, community, export), each with Spring endpoints, Java tests for every ported rule, a migration removing the old database objects (tested on a real Postgres engine), and a switched frontend module. The plan is in [ADR 0008](decisions/0008-move-to-spring-in-slices.md).
- **Result.** The browser no longer has any database access, the rules are testable Java, and the final migration revokes the browser roles' privileges.

## Nobody could build the database

- **Situation.** The migrations were small changes on top of a schema first made by clicking in the Supabase dashboard, so there was no way to create the database from nothing. The backend tests ran on a hand-kept copy of the tables that had quietly drifted from production.
- **Task.** Capture the real schema as a baseline, and make the tests use it instead of a copy.
- **Action.** Dumped the production schema with `pg_dump` (read-only) and cleaned it: left out 15 old policies that called Supabase's `auth.uid()`, six `user_id` defaults that pointed at it, and Supabase's own helper function, so the file runs on plain PostgreSQL. Generated the shared ingredients and product types as a second file. Then proved it three ways: built a fresh PostgreSQL from only those files and diffed its schema against production (only the intended differences remained), compared an md5 of every reference row between the two, and applied a small follow-up migration to a copy of production's schema to confirm it ends up identical to the baseline. The tests now start from those same files.
- **Result.** A new machine can build the database in one command, and the test database cannot drift because it is the production schema. Building it for real found things the hand-kept copy hid: a case-insensitive unique index on emails, 8 product types instead of 3, and the old policies still sitting in production.

## Logged out by a hiccup

- **Situation.** After auth moved into the backend, the app kept failing to autosave and load recipes, and signed people out "after a while".
- **Task.** Find out whether it was the sign-in design or something under it.
- **Action.** Reading the code showed two causes. The client treated *any* failed token renewal other than a lost connection as "signed out", so one 500 or 429 ended the session. And the database URL used the Supabase transaction pooler (port 6543), where the driver's prepared statements fail at random, which was producing those 500s in the first place. I switched to the session pooler (port 5432), set a small pool that recycles connections before the pooler drops them, made the client sign out only on a real 401 and retry otherwise, and made it renew the token a minute before expiry and again when the tab wakes up or the network returns. A related race showed up next: the page's first "am I already signed in?" check could answer "no" after the person had just signed in, and wiped the new session until a reload. Every change to the session now bumps a counter, and a slow answer about an older state is ignored.
- **Result.** A flaky server no longer ends a session, and the first save after being away does not meet an expired token. Each behaviour has a test, including "a 503 must not sign you out". The lesson: a random failure that looks like an auth bug can sit one layer lower.

## Everyone could read everyone's custom ingredients

- **Situation.** While porting the ingredient queries I found that the old database policy "Allow read access for all users" matched every row, so any visitor, signed in or not, could read other people's private custom ingredients.
- **Task.** Fix the leak as part of the move, not as a separate patch.
- **Action.** The backend returns only shared ingredients and the caller's own, with the owner condition in the SQL, and a test reads the list as a second member.
- **Result.** Private ingredients stay private, and the rule is readable Java ([ADR 0005](decisions/0005-authorization-in-java.md)).

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

## Tests that passed on a database I don't run

- **Situation.** The API tests ran on H2 in PostgreSQL mode while production is PostgreSQL. Every gap needed a workaround (a `Dialect` class existed only to add a `jsonb` cast on one of the two), and a green test only proved the SQL worked on H2.
- **Task.** Make a passing test mean something about production, without making the suite painful to run.
- **Action.** Switched the Spring tests to a PostgreSQL 17 container (Testcontainers), shared by the whole run and started once, and deleted H2 and `Dialect`. The first run passed 225 of 235 tests. The 10 failures were all H2-only SQL inside the tests (`random_uuid()`, `merge ... key`, an upper-case constraint name), and one of them left a product type deleted, which caused most of the rest.
- **Result.** The suite needs Docker, but the tests now check the engine that runs in production ([ADR 0009](decisions/0009-api-tests-on-real-postgresql.md)). Migrations keep their own tests on a real Postgres engine (PGlite).
