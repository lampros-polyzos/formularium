# 0009. API tests run on a real PostgreSQL, not H2

Status: Accepted (replaces the earlier choice of H2 in PostgreSQL mode, which needed a `Dialect` class to cover the differences)

## Context
The API tests started on H2 in PostgreSQL mode because it is quick and needs nothing installed. It is not PostgreSQL, though, and every gap needed a workaround: a `Dialect` class existed only to add the `jsonb` cast on one database and not the other. More important is what such a test cannot say. An H2 test passing means the SQL works on H2, not on production. The differences that matter for this app:
- **Types:** `jsonb`, arrays and timestamps with time zone behave differently or do not exist.
- **Functions and syntax:** `gen_random_uuid()`, `on conflict`, casts and `returning`.
- **Errors:** constraint names and messages are spelled differently, and H2 folds names to upper case. Code and tests that react to a failed constraint were checked against the wrong text.
- **Concurrency:** the guard that stops two batches overdrawing a stash lot depends on how row locks and isolation work in the real engine.

## Decision
The Spring tests run against PostgreSQL 17, the version Supabase uses, in a Testcontainers Docker container. One container starts per test run (`PostgresForTests`, registered in `src/test/resources/META-INF/spring.factories`), is filled once from `src/test/resources/schema.sql`, and is removed by Testcontainers afterwards. H2 and `Dialect` are gone.

## Consequences
- **Good:** a green test means the SQL works on the engine that runs in production, and no code is written only to satisfy the test database. The first run on real PostgreSQL passed 225 of 235 tests; the other 10 failed on H2-only SQL inside the tests themselves (`random_uuid()`, `merge ... key`, an upper-case constraint name), which is the kind of thing this change is meant to expose.
- **Cost:** `./mvnw test` needs Docker running, and the first run downloads the image. A fresh start adds a few seconds. GitHub's `ubuntu-latest` runners have Docker, so CI needs no change.
- **Still not covered:** Supabase specifics (the connection pooler, roles, extensions), and `schema.sql` is still a hand-kept copy of the production tables, so it can drift until a baseline migration replaces it (see the [roadmap](../roadmap.md)). The migrations themselves are checked separately on a real Postgres engine in the frontend tests (PGlite).
