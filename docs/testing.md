# Testing

About 235 backend tests and 1,670+ frontend tests. CI runs both on every push and pull request to `main` (`.github/workflows/ci.yml`).

```bash
cd backend  && ./mvnw test      # JDK 27
cd frontend && npm test         # Node 20+
```

## What is tested where

| Layer | Tool | What it proves | Where |
|---|---|---|---|
| Domain logic | Vitest, no DOM | Calculators, auto-balance, regional limits, batch planning, parsers behave on normal and edge inputs | `frontend/src/lib/*.test.ts` |
| UI | Vitest + Testing Library (happy-dom) | Screens behave the way a person uses them: labels, roles, error messages, what is sent to the API. API modules are mocked | `frontend/src/pages`, `components` |
| Frontend API clients | Vitest | The right path, method and body go out, and errors come back readable (token refresh, error codes, 202/204 answers) | `frontend/src/lib/*Api.test.ts`, `authClient.test.ts` |
| Backend API | JUnit + MockMvc, full Spring context, H2 | Every endpoint with real security: signed in or not, owner or another member, validation, rate limits, plain-language errors | `backend/src/test/java/.../*ApiTest.java`, `AuthFlowTest`, `EmailVerificationAndResetTest` |
| Backend rules and PDFs | JUnit | The validation rules and that each PDF generator produces a document | `rules/`, `export/` |
| SQL migrations | Vitest + PGlite (real Postgres engine in-process) | Each migration removes what it says, keeps every row, and is safe to run twice | `frontend/src/db/*.sql.test.ts` |

## Patterns worth knowing

- **Test the rule from both sides.** For ownership, a test acts as the owner (works) and as a second member (finds nothing). For limits, a test hits the limit and then checks the message.
- **A guard test against drift.** The account-export test lists every table with a person's id column from the schema and fails if one is missing from the export or the deliberate exclusions.
- **Time is controlled.** The auth tests use a movable clock to check link expiry, the resend gap and the sign-in attempt window without waiting.
- **Email is a seam.** `EmailSender` is mocked in tests and captured to read the link a person would click.

## Before each commit

The git hook in `.githooks/pre-commit` blocks a commit that contains a secret from your local settings (or a well-known key shape), then runs the frontend tests when frontend files changed. `npm install` in `frontend/` turns it on; so does `node scripts/install-hooks.mjs`.

## Not covered yet

There are no browser end-to-end tests (Playwright or similar), and no load or accessibility-audit tooling. See the [roadmap](roadmap.md).
