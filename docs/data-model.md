# Data model

PostgreSQL, one `public` schema. The backend reads and writes it with plain SQL and connects with the database owner's credentials. Row-level security is switched **on with no policies** on the app's tables, and the browser roles (`anon`, `authenticated`) have no privileges, so the API is the only way in.

## Tables and who owns what

| Area | Tables | Owner rule |
|---|---|---|
| Accounts | `app_users`, `refresh_tokens`, `email_tokens` | `refresh_tokens` and `email_tokens` belong to a user and hold only hashes, never the token itself |
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

Deleting an account deletes everything above that points at it: every foreign key to `app_users` is `on delete cascade`. The data export (`GET /api/v1/account/export`) lists its tables explicitly, and a test fails if a new table with a person's id column is neither exported nor deliberately excluded.

## Ownership is enforced in Java

There are no database policies doing this work. Each service method takes the caller's id from the verified token and puts it in the query, for example `where id = :id and user_id = :uid`. A request for someone else's row finds nothing and answers `404`, so it does not even confirm the row exists. Every rule has a test in `backend/src/test` that tries it as a second user.

## Migrations

- SQL files in [`supabase/migrations`](../supabase/migrations), named `YYYYMMDDHHMMSS_what_it_does.sql`, applied in order by hand (Supabase SQL editor or `psql`).
- Each one is **idempotent** (`if not exists`, `drop ... if exists`, guarded `do` blocks), so running it twice is harmless.
- Each one has a test (`frontend/src/db/*.sql.test.ts`) that applies it to a real Postgres engine (PGlite) with stand-in tables and checks the result: data kept, objects removed, a second run changes nothing.
- Destructive steps say so in their header and are written to stop with an error rather than guess (for example the table cleanup drops without `CASCADE`).

**Known gap:** the migrations are incremental changes to a schema that was first created in the Supabase dashboard. There is no single baseline file for building a database from nothing yet. It is on the [roadmap](roadmap.md).

## Test schema

Backend tests run on H2 in PostgreSQL mode using `backend/src/test/resources/schema.sql`, a hand-kept copy of the schema. Two places need care because H2 and Postgres differ: JSON columns (a small `Dialect` adds the `jsonb` cast only on Postgres) and array columns.
