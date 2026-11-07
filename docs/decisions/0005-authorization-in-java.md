# 0005. Authorization in Java queries, not database policies

Status: Accepted

Date: 2026-11-06

## Context
Supabase relied on row-level security policies, evaluated against the signed-in user, to decide who could see and change what. With the backend connecting as the database owner, those policies no longer apply.

## Decision
Each service method takes the caller's id from the verified token and puts it in the query (`where id = :id and user_id = :uid`). A row that is not yours is simply not found (`404`), so the API does not confirm it exists. Policies were dropped, and row-level security stays on with no policies as a second lock for any other database role.

## Consequences
- **Good:** the rules are readable Java, covered by tests that try each one as a second member; no hidden logic in the database.
- **Cost:** every new query must remember the owner condition. The tests help (each endpoint is tried as another user), but a forgotten condition is the main risk of this design, so reviews and tests focus on it.
