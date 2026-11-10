# Data model

PostgreSQL, one `public` schema. The backend reads and writes it with plain SQL and connects with the database owner's credentials. Row-level security is switched **on with no policies** on the app's tables, and the browser roles (`anon`, `authenticated`) have no privileges, so the API is the only way in.

## Tables and who owns what

| Area | Tables | Owner rule |
|---|---|---|
| Accounts | `app_users`, `refresh_tokens`, `email_tokens` | `refresh_tokens` and `email_tokens` belong to a user and hold only hashes, never the token itself |
| | `passkeys` | A member's passkeys: credential id, the PUBLIC key, a name and dates. The private key never leaves their device. `webauthn_challenges` are the five-minute one-time challenges of registrations and sign-ins under way |
| Library | `ingredients` | `user_id` empty = shared catalogue everyone can read; set = that member's own custom ingredient, visible only to them |
| | `user_stash`, `user_containers`, `favorite_ingredients`, `user_starred_ingredients` | `user_id` |
| Formulas | `formulation_profiles` | Shared product types (O/W lotion, serum...), read-only for members |
| | `formulations` | `user_id` |
| | `formulation_phases`, `formulation_ingredients` | Through their formula |
| | `formulation_versions` | `user_id` |
| Batches | `batches`, `batch_ingredients`, `batch_stash_usage`, `batch_checks` | `user_id` |
| Community | `community_posts`, `post_comments` | `author_id`, plus a stored `author_name` that follows renames |
| | `post_snapshots` | Versions of a shared recipe, through the post |
| | `recipe_ratings` | `user_id`, one per member per recipe |
| | `notifications` | `recipient_id` |
| | `community_mutes`, `content_reports` | `user_id` / `reporter_id` |
| | `community_moderators` | A list of user ids with moderator rights, edited by hand |

A guest (the "Try the demo" account) is an `app_users` row with `guest_expires_at` set: no password, an address under `guest.invalid`, deleted when that time passes, with everything it owns.

Deleting an account deletes everything above that points at it: every foreign key to `app_users` is `on delete cascade`. The data export (`GET /api/v1/account/export`) lists its tables explicitly, and a test fails if a new table with a person's id column is neither exported nor deliberately excluded.

## Ownership is enforced in Java

There are no database policies doing this work. Each service method takes the caller's id from the verified token and puts it in the query, for example `where id = :id and user_id = :uid`. A request for someone else's row finds nothing and answers `404`, so it does not even confirm the row exists. Every rule has a test in `backend/src/test` that tries it as a second user.

## Migrations

Files in [`supabase/migrations`](../supabase/migrations), named `YYYYMMDDHHMMSS_what_it_does.sql`, applied in order, by hand ([ADR 0012](decisions/0012-migrations-are-sql-files-applied-by-hand.md)):

| File | What it is |
|---|---|
| `20261101000000_baseline.sql` | The whole `public` schema (25 tables, 4 enum types, indexes, constraints, row-level security switched on, no policies), dumped from production with `pg_dump` |
| `20261101000001_reference_data.sql` | The shared ingredient library and the product types. Never anyone's own rows |
| `20261108000000_align_production_with_baseline.sql` | Brings the existing production database in line with the baseline (drops the old policies and Supabase-specific column defaults). A no-op on a database built from the baseline |
| `20261108000001_remove_duplicate_ingredients.sql` | Deletes two duplicate ingredients (BTMS-50 and Euxyl PE 9010 each existed twice) if nothing uses them, and adds a unique index so a shared ingredient's trade name cannot repeat |
| `20261108000002_auth_events.sql` | The `auth_events` table: the audit trail of sign-ins, failures, resets and replayed tokens (no passwords, no raw emails, 90 days), which the login throttle also reads |
| `20261108000003_two_step_verification.sql` | The tables for two-step verification: the encrypted authenticator secret (`user_mfa`), hashed recovery codes (`mfa_recovery_codes`) and the one-time sign-in challenges (`mfa_challenges`) |
| `20261110120000_guest_accounts.sql` | The `guest_expires_at` column on `app_users`, for the temporary "Try the demo" accounts ([ADR 0013](decisions/0013-guest-sessions-for-the-demo.md)), and an index on it for guests only |
| `20261110180000_passkeys.sql` | The `passkeys` table (credential id, public key, counter, name, dates, backup flags; deleted with its member) and `webauthn_challenges` (one-time, five minutes), both closed to the browser roles ([ADR 0014](decisions/0014-passkeys-as-a-full-sign-in.md)) |
| `20261110200000_password_sign_in_off.sql` | The `password_login_disabled_at` column on `app_users`: when a member switched password sign-in off (empty means on, as it is for every existing account) ([ADR 0015](decisions/0015-password-sign-in-can-be-switched-off.md)) |

**Building a database from nothing:** run all nine files in order (the first two are the schema and the shared data; the rest add the sign-in audit trail, two-step verification, guest accounts, passkeys and the password sign-in switch, which the backend needs), or `supabase db reset`. The tests do exactly this. **A database that was already in production before the baseline** has that schema and data, so it needs only the seven files after the first two (`20261108000000` to `20261110200000`); with the Supabase CLI, first mark the first two as applied (`supabase migration repair --status applied 20261101000000 20261101000001`), because the history was kept by hand. The live production database has all nine. Apply a new migration **before** deploying the code that reads it ([ADR 0012](decisions/0012-migrations-are-sql-files-applied-by-hand.md)): for example, the backend selects `guest_expires_at` in every user query, so without that column nobody can sign in.

The migrations that built the schema step by step (20261110 to 20261124) are in `supabase/migrations-archive/` for the history. They must not be applied on top of the baseline.

Rules for new migrations:
- Write each one to be **idempotent** (`if not exists`, `drop ... if exists`, guarded `do` blocks), so running it twice is harmless.
- Give it a test (`frontend/src/db/*.sql.test.ts`) that applies it to a real Postgres engine (PGlite) with stand-in tables and checks the result: data kept, objects removed, a second run changes nothing. The archived migrations' tests keep their own copies in `frontend/src/db/fixtures/`.
- Say so in the header of anything destructive, and make it stop with an error rather than guess (for example, dropping without `CASCADE`).

## Test database

The backend tests build their PostgreSQL from all the migrations above, in a Docker container ([ADR 0009](decisions/0009-api-tests-on-real-postgresql.md)). There is no separate test schema, so tests cannot drift from production: every file in `supabase/migrations` is applied in name order, so a new migration is picked up by the tests as soon as it is added.
