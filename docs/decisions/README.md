# Architecture decision records

One short file per significant choice: what was decided, why, and what it costs. They are written so that someone new (or me in a year) can tell whether a decision still holds.

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-postgres-on-supabase-database-only.md) | PostgreSQL on Supabase, used as a database only | Accepted | 2026-11-05 |
| [0002](0002-spring-boot-owns-the-rules.md) | The Spring Boot backend owns validation and business rules | Accepted | 2026-10-28 |
| [0003](0003-own-authentication.md) | Own authentication: short-lived access token plus rotating refresh cookie | Accepted | 2026-11-06 |
| [0004](0004-jdbcclient-over-jpa.md) | Plain SQL with `JdbcClient` instead of JPA | Accepted | 2026-11-06 |
| [0005](0005-authorization-in-java.md) | Authorization in Java queries, not database policies | Accepted | 2026-11-06 |
| [0006](0006-polling-for-notifications.md) | Notifications by polling, not push | Accepted | 2026-11-06 |
| [0007](0007-email-confirmation-required.md) | Email confirmation required, links stored as hashes | Accepted | 2026-11-06 |
| [0008](0008-move-to-spring-in-slices.md) | Move to Spring one slice at a time | Accepted | 2026-11-06 |
| [0009](0009-api-tests-on-real-postgresql.md) | API tests run on a real PostgreSQL, not H2 | Accepted | 2026-11-07 |

Format: Status, Date, Context, Decision, Consequences. The date is when the decision was put into practice, taken from the commit history. Add a new file rather than rewriting an old one; mark the old one "Superseded by NNNN".
