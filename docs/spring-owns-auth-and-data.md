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
3. ~~**Formulas**~~ **done**: product types (profiles), formulas with their phases and ingredients, saving, copying, deleting, linking a formula to its shared post, and the
   version history (`backend/.../formulas/`, `frontend/src/lib/formulasApi.ts`). A save writes the details and the whole contents in one transaction.
   Needs `20261118000000_starter_formulas_in_spring.sql` and `20261119000000_formula_versions_in_spring.sql`. Still on Supabase: batches, community, notifications.
4. ~~**Batches**~~ **done**: starting a batch (the stash is deducted and the cost worked out in one transaction), undoing and deleting it, editing it, the check-ins
   and the lists the metrics read (`backend/.../batches/`, `frontend/src/lib/batches.ts`). Needs `20261120000000_batches_in_spring.sql`, which removes the old
   `create_batch` and `void_batch` functions. Still on Supabase: community, notifications, the data export.
5. ~~**Community**~~ **done**: posts, comments, recipe versions, ratings, reports, mutes, moderation, the public recipe previews and the roughly dozen triggers that
   enforced the rules (`backend/.../community/`, `frontend/src/lib/communityApi.ts`). Needs `20261121000000_community_in_spring.sql`. Moderators are still added by
   inserting their id into `community_moderators`. Display names are now 3 to 30 characters (letters, digits, `_`, `.`, `-`) and changing one updates everything you wrote.
6. ~~**Notifications**~~ **done** with the community slice: the bell asks the backend every 30 seconds (the Supabase realtime channel is gone).
7. ~~**Data export and account deletion**~~ **done**: `GET /api/v1/account/export` (`backend/.../account/`, an explicit list of tables, with a test that fails when a new
   table holding a person's rows is not listed) and `DELETE /api/v1/auth/me`.
8. ~~**Close the door**~~ **done**: `20261122000000_close_the_door.sql` removes `export_my_data`, `delete_my_account` and `account_owned_tables` and revokes every browser-role
   (`anon`, `authenticated`) privilege in `public`. `@supabase/supabase-js`, `lib/supabase.ts` and the `VITE_SUPABASE_*` variables are gone from the frontend.
   The backend must connect with the database owner role (the `postgres` user or the pooler string from Supabase), not `anon`/`authenticated`.
   The unused `profiles`, `users` and `reviews` tables are left in place: check them and drop them by hand (commands are at the end of the migration).

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
- **Formula history** now has its own migration (`20261119000000_formula_versions_in_spring.sql`); the old unapplied `20261109` version was removed.
- **Copying a community recipe** leaves out lines that use another member's private ingredient (they cannot be shared). The copy is still made.
- **Starter formulas: done.** They are created by the Spring backend in the same transaction as the account (`backend/.../starter/`, `AccountCreator`), for password and
  Google sign-up alike, and the three recipes now live in code (`StarterFormulas`). Run `supabase/migrations/20261118000000_starter_formulas_in_spring.sql` to remove the
  old database trigger and function, at the same time as you deploy the backend. Accounts that already have their starter formulas keep them.

- **Email confirmation and password reset are built.** Needs `20261123000000_email_verification_and_reset.sql` (existing accounts are marked confirmed, so nobody is locked out).
  Sign-up sends a link (valid 24 hours, once) and the account cannot sign in until it is clicked; Google accounts are confirmed already. "Forgot your password?" sends a link
  (valid one hour, once) that sets a new password, confirms the address and signs the account out everywhere. Neither endpoint reveals whether an email has an account,
  and a new link is not sent more than once a minute. Emails go through any SMTP server: set `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` and `APP_URL`
  (the website's address, used in the links). Without `MAIL_HOST` the emails are only written to the backend log, links included, which is enough to try it locally.
  `AUTH_REQUIRE_VERIFIED_EMAIL=false` switches the confirmation requirement off (development only).
- Until the data slices are done, anything that reads Supabase tables directly (library, stash, formulas, community, notifications) and the data export see no signed-in user and will not work on this branch.
- Account deletion removes the account and, through foreign keys, whatever cascades from it. The old `delete_my_account` function may do more: it is replaced in slice 7.
- The `profiles` table is now unused by Spring (the username lives in `app_users`). It is dropped in the final step, together with the unused `users` and `reviews` tables.
- The sign-in attempt limit and its counters live in memory: fine for one instance, needs a shared store (database or Redis) with several.
- Existing Supabase accounts are not imported (start fresh was chosen).
