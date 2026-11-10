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
| [0010](0010-keep-own-authentication-and-harden-it.md) | Keep our own authentication, and harden it for real users | Accepted | 2026-11-08 |
| [0011](0011-two-step-verification-with-an-authenticator-app.md) | Two-step verification with an authenticator app | Accepted | 2026-11-08 |
| [0012](0012-migrations-are-sql-files-applied-by-hand.md) | Migrations are plain SQL files, applied by hand | Accepted | 2026-11-08 |
| [0016](0016-alerts-for-sign-ins-from-a-new-browser.md) | Alerts for a sign-in from a browser the account has not been seen on | Accepted | 2026-11-10 |
| [0015](0015-password-sign-in-can-be-switched-off.md) | Password sign-in can be switched off, once a passkey has proved it works | Accepted | 2026-11-10 |
| [0014](0014-passkeys-as-a-full-sign-in.md) | Passkeys as a full, phishing-resistant sign-in | Accepted | 2026-11-10 |
| [0013](0013-guest-sessions-for-the-demo.md) | "Try the demo" makes a temporary guest account for each visitor | Accepted | 2026-11-10 |

Format: Status, Date, Context, Decision, Consequences. The date is when the decision was put into practice, taken from the commit history. Add a new file rather than rewriting an old one; mark the old one "Superseded by NNNN".
