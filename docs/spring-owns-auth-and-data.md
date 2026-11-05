# Moving auth and data from Supabase to the Spring backend

Branch: `spring-owns-auth-and-data`. Goal: Supabase is only the PostgreSQL host. Spring owns sign-in, authorization and every data call.

## Why it cannot be done in one small step

The browser reads about 22 tables straight from Supabase, and the database's rules (policies, the saved-formula and batch functions) identify the
user through Supabase's login system. So the data access has to move together with the login. Until the last slice is done, the frontend on this
branch is not fully working. Work in slices, merge only when the whole app works again.

## Done: slice 0, accounts (backend + database)

| Piece | Where |
| --- | --- |
| Accounts and refresh-token tables, foreign keys moved off Supabase's user table | `supabase/migrations/20261116000000_spring_owns_auth.sql` |
| Sign-up, sign-in, Google sign-in, refresh-token rotation with theft detection, sign-out, account delete | `backend/.../auth/` |
| Every `/api/v1` endpoint now needs a valid access token | `backend/.../config/SecurityConfig.java` |
| Tests | `AuthFlowTest` (21), `springAuth.sql.test.ts` (8, real Postgres engine) |

How it works: passwords are hashed with bcrypt (cost 12). An access token is a 15-minute signed JWT kept in the app's memory. A refresh token is a random
string in an HttpOnly, SameSite cookie, stored in the database only as a SHA-256 hash, and swapped for a new one on every use. A refresh token used twice ends
the whole sign-in. Five wrong passwords for one account and address block further attempts for 15 minutes. Google sign-in verifies Google's ID token on the server.

### Settings the backend needs

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | JDBC address and owner credentials of the PostgreSQL database, for example `jdbc:postgresql://db.<ref>.supabase.co:5432/postgres` |
| `AUTH_JWT_SECRET` | 32+ random characters. The app will not start without it. |
| `GOOGLE_CLIENT_ID` | Client id of the Google button. Empty turns Google sign-in off. |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret. Empty skips the bot check. |
| `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE` | `true` in production. `Lax` when site and API share a domain, `None` otherwise. |
| `CORS_ALLOWED_ORIGIN` | Address of the website. |

Run the migration (`supabase db push` or the SQL editor) before starting the backend. Old rows that belong to Supabase accounts are kept but orphaned:
delete them once you are sure you do not need them.

## Next: slices (one per feature, each with tests)

1. ~~**Frontend sign-in**~~ **done** (`lib/authClient.ts`, `AuthContext`, `AuthModal`, `GoogleSignInButton`): the token lives in memory, one shared refresh call,
   the token is sent with validate and export. Needs `VITE_GOOGLE_CLIENT_ID` and `VITE_API_BASE_URL` in the frontend environment.
2. ~~**Library data**~~ **done**: ingredients (shared and your own, search, add), starred and favourite ingredients, stash and containers
   (`backend/.../library/`, `frontend/src/lib/libraryApi.ts`). Needs `supabase/migrations/20261117000000_account_delete_cascade.sql`, so deleting an
   account also removes what it owns. Still on Supabase and therefore broken on this branch: product types (`formulation_profiles`), formulas, batches,
   community, notifications.
3. **Formulas**: formulations, ingredients, phases, profiles, versions, `save_formulation_contents`.
4. **Batches**: batches, checks, ingredients, stash usage, `create_batch`, `void_batch`.
5. **Community**: posts, comments, ratings, reports, mutes, snapshots, moderators, `public_recipe_previews`, `is_moderator`.
6. **Notifications**: replace the Supabase realtime channel with server-sent events.
7. **Data export and account deletion**: replace the `export_my_data` and `delete_my_account` functions.
8. **Close the door**: revoke the browser roles' access to every table, remove `@supabase/supabase-js` from the frontend, delete the bridge code.

Each slice: the Spring endpoints enforce who may see and change what in Java (this replaces the row-level policies), with a test for every rule, then the
frontend screens switch to them.

## What is needed to continue

The real table definitions. They are not in the repository and the API will not show them without the service key. Easiest way, no tools to install:
open the Supabase dashboard, SQL Editor, paste the contents of `docs/export-schema.sql` and run it. It returns one cell with the structure of the public
schema (tables, columns, keys, access policies, functions, triggers) and no data. Save that cell as `docs/schema-dump.json`.

(If you prefer the command line, `pg_dump --schema-only --schema=public` and a query on `pg_policies` give the same information, but they need the
PostgreSQL client tools installed.)

## Known gaps and decisions

- **Privacy fix on the way:** the old database let every signed-in or signed-out visitor read every ingredient, including other people's custom ones
  (a policy named "Allow read access for all users" allowed all rows). The backend only shows the shared ingredients and your own.
- **`unique_inci_name`** (a unique index on the INCI name alone) means two library rows cannot share an INCI name, for example a powder and a solution of
  the same ingredient. Check that the ingredient migrations from `20261112` onwards were applied in full.
- **`formulation_versions` is missing** from the live database: `frontend/src/db/fixtures/20261109000000_formula_versions.sql` was never applied.
- **Starter formulas: done.** They are created by the Spring backend in the same transaction as the account (`backend/.../starter/`, `AccountCreator`), for password and
  Google sign-up alike, and the three recipes now live in code (`StarterFormulas`). Run `supabase/migrations/20261118000000_starter_formulas_in_spring.sql` to remove the
  old database trigger and function, at the same time as you deploy the backend. Accounts that already have their starter formulas keep them.

- **No email confirmation yet.** Supabase sent a confirmation link on sign-up; the Spring sign-up signs people in immediately. Add email verification (an SMTP provider, a one-time token table and a verify endpoint) before opening sign-ups to the public.
- **No password reset yet.** Same reason: it needs email. Plan it together with email confirmation.
- Until the data slices are done, anything that reads Supabase tables directly (library, stash, formulas, community, notifications) and the data export see no signed-in user and will not work on this branch.
- Account deletion removes the account and, through foreign keys, whatever cascades from it. The old `delete_my_account` function may do more: it is replaced in slice 7.
- The `profiles` table is now unused by Spring (the username lives in `app_users`). The community slice decides whether to drop it or turn it into a view.
- The sign-in attempt limit and its counters live in memory: fine for one instance, needs a shared store (database or Redis) with several.
- Existing Supabase accounts are not imported (start fresh was chosen).
