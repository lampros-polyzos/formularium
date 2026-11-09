# 0012. Migrations are plain SQL files, applied by hand

Status: Accepted

Date: 2026-11-08

## Context
One developer, one production database (on Supabase), a few schema changes a month. The backend connects as the table owner, and Render redeploys it from `main` on every push. The options were a migration tool that runs when the app starts (Flyway, Liquibase), the Supabase CLI, a newer lightweight tool, or plain files applied by hand.

Running migrations at app start is the usual default, and it fits this setup badly:
- A failed or slow migration stops the new version from booting, and a service on a free plan restarts and wakes often.
- Two instances starting together race for the same change.
- Rolling the app back to an earlier deploy does not roll the schema back, so the old code meets the new schema anyway.
- It makes the running service rely on DDL rights, which the app has only because it connects as the owner.

A tool also keeps its own history table. The production database was built before there was one, and its history was kept by hand, so adopting a tool means back-filling that table first. The baseline migration (a `pg_dump` of the schema) already lets anyone build a database from nothing, which was the real gap.

## Decision
- A schema change is a file in [`supabase/migrations`](../../supabase/migrations), named `YYYYMMDDHHMMSS_what_it_does.sql` and applied **by the maintainer, by hand, in file-name order**: in the Supabase SQL editor, or with `psql` against the session pooler (port 5432).
- **Migrate first, deploy second.** A migration must keep working for the code that is still running, so the new schema goes in before the code that needs it.
- Every file is idempotent, so running it again is harmless, and a destructive one stops with an error instead of guessing. Each has a test on a real Postgres engine. The rules are in [data-model.md](../data-model.md#migrations).
- The backend tests build a fresh PostgreSQL from every file in order ([ADR 0009](0009-api-tests-on-real-postgresql.md)), so a file that does not apply cleanly from scratch fails CI.
- The running app never changes the schema.

## Consequences
- **Good:** nothing extra to run or to give privileges to; the app's start-up cannot be blocked by a migration; one set of files serves local development, CI and production, and they are plain SQL anyone can read.
- **Cost:** nothing records what has been applied, so a release can forget one. The list in data-model.md is the record, and because every file is safe to run twice, the answer to "is this applied?" can be "run it again". Each release has one human step. There is no automatic rollback: to undo a change, write a new migration forward.
- **Revisit when** a second person starts applying changes, there is a staging database, or a release goes out missing a migration even once. The step up is Flyway or the Supabase CLI run from CI, never at app start, with the baseline file as the first version (the files would need that tool's naming).
