# 0004. Plain SQL with `JdbcClient` instead of JPA

Status: Accepted

## Context
The schema is owned by SQL migrations, and the interesting operations are specific: deduct stash with a guard, rewrite a formula's phases in one go, upsert a rating, return nested JSON-shaped formulas. An ORM would sit between those statements and the database.

## Decision
Use Spring's `JdbcClient` with hand-written SQL in repositories and services, `@Transactional` at the service layer, and small helpers to turn rows into JSON-ready maps.

## Consequences
- **Good:** every query is visible and reviewable, transactions are explicit, there is no lazy-loading surprise, and the SQL matches what the migrations create.
- **Cost:** manual mapping and more verbose code; no automatic schema checks (migrations plus tests are the safety net); a few spots differ between H2 (tests) and PostgreSQL, handled by a small `Dialect` helper.
