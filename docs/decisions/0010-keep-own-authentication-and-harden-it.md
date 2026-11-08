# 0010. Keep our own authentication, and harden it for real users

Status: Accepted

Date: 2026-11-08

Builds on [0003](0003-own-authentication.md), which describes the design. This record is about whether to keep it now that real people will use it.

## Context
"Don't roll your own auth" is good advice, and the app is going to real users. The project has no budget for a paid identity provider. The question is whether a free path is safe enough, and what it needs.

What is built is not new cryptography. It uses Spring Security and Nimbus for the tokens, bcrypt for passwords and a standard library to check Google's tokens. What is ours is the session policy: refresh-token rotation with reuse detection, the email flows, and the throttling.

## Alternatives considered
| Option | Why not (for now) |
|---|---|
| Auth0, Clerk and other hosted providers | The free tiers are limited and the cost grows with users, which this project cannot carry. They speak standard OIDC, so leaving later would be a configuration change. |
| Supabase Auth | Free, and already the database host, but it ties sign-in back to Supabase and undoes [0001](0001-postgres-on-supabase-database-only.md): the database could no longer move to any PostgreSQL host. |
| Keycloak or Zitadel, self-hosted | No fee, but a second critical service to run, patch and back up, which a one-person project cannot do well. |
| Spring Authorization Server | A toolkit for building an OAuth2 issuer: more machinery for one first-party app, not less. |

## Decision
Keep our own authentication, and close the gaps that matter once real people depend on it:
- **Throttling in the database, in three layers** (one account from one address, one account from anywhere, one address against any accounts), shared by every instance and surviving restarts. Limits on how many confirmation or reset emails one address can ask for.
- **A password must not appear in a known data breach**, checked with the free Pwned Passwords range service. Only the first 5 characters of the password's SHA-1 are sent, and a failure of that service never blocks signing up.
- **Passwords are limited by bytes, not characters**, as bcrypt reads only 72 bytes. Longer ones are refused with a clear message.
- **An audit trail** (sign-ins, failures, resets, confirmations, a replayed refresh token) with no passwords and no raw email addresses, kept 90 days, shown in the member's data export, and mentioned in the privacy policy.
- **Dependabot and CodeQL**, a security policy (`SECURITY.md`), and an operator checklist in [docs/security.md](../security.md).

The API stays a standard OAuth2 resource server, so moving to an external provider later means changing the token settings and deleting the sign-in endpoints; nothing else in the code depends on how sign-in works.

## Consequences
- **Good:** no running cost, no third party holding the accounts, and the main attacks on a password-based system (guessing, stuffing, leaked passwords, inbox flooding, token theft) each have a control and a test.
- **Cost:** the project carries the responsibility. At the time of this decision three things were missing: multi-factor sign-in, a way to change a password while signed in, and alerts about sign-ins from new devices. Without MFA, a strong, unbreached password was the only barrier, the biggest gap. Multi-factor sign-in was added the same day ([0011](0011-two-step-verification-with-an-authenticator-app.md)); the other two are on the [roadmap](../roadmap.md) and in [docs/security.md](../security.md).
- **Revisit** this decision if the app gets many users, needs single sign-on, or handles anything more sensitive than recipes.
