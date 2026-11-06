# 0001. PostgreSQL on Supabase, used as a database only

Status: Accepted (replaces the first design, where Supabase also provided sign-in, access policies, functions and triggers)

## Context
The app began on Supabase's full platform: its sign-in, row-level security policies, about a dozen triggers and several database functions did much of the work, with the browser talking to the database directly. That was fast to start but meant the rules lived in places that are hard to test, review and move, and the Spring backend was only one part of the picture.

## Decision
Keep Supabase for what it does well, hosting PostgreSQL, and nothing else. The Spring backend owns authentication, authorization, validation, business rules, PDF export and email. The browser calls only the backend. The browser's database roles have no privileges and the app's tables have row-level security on with no policies.

## Consequences
- **Good:** every rule is Java with tests; one place to look; the database can move to any Postgres host; the frontend has a single, typed way to reach data.
- **Cost:** more code to write and maintain (sign-in, email, ownership checks) instead of using hosted features; realtime updates were given up ([0006](0006-polling-for-notifications.md)); accounts from the old setup were not imported.
- Moving over was done in slices, each with tests and a migration. See [`spring-owns-auth-and-data.md`](../spring-owns-auth-and-data.md).
