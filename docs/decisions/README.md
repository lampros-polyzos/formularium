# Architecture decision records

One short file per significant choice: what was decided, why, and what it costs. They are written so that someone new (or me in a year) can tell whether a decision still holds.

| # | Decision | Status |
|---|---|---|
| [0001](0001-postgres-on-supabase-database-only.md) | PostgreSQL on Supabase, used as a database only | Accepted |
| [0002](0002-spring-boot-owns-the-rules.md) | The Spring Boot backend owns validation and business rules | Accepted |
| [0003](0003-own-authentication.md) | Own authentication: short-lived access token plus rotating refresh cookie | Accepted |
| [0004](0004-jdbcclient-over-jpa.md) | Plain SQL with `JdbcClient` instead of JPA | Accepted |
| [0005](0005-authorization-in-java.md) | Authorization in Java queries, not database policies | Accepted |
| [0006](0006-polling-for-notifications.md) | Notifications by polling, not push | Accepted |
| [0007](0007-email-confirmation-required.md) | Email confirmation required, links stored as hashes | Accepted |

Format: Context, Decision, Consequences. Add a new file rather than rewriting an old one; mark the old one "Superseded by NNNN".
