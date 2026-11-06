# Formularium backend

The Spring Boot API behind [Formularium](../README.md): sign-in, every read and write of the app's data, validation rules, PDF export and email. It is the only thing that talks to the database.

**Stack:** Java 27, Spring Boot 4, Spring Security (JWT resource server), `JdbcClient` (plain SQL), Bean Validation, OpenPDF, PostgreSQL (H2 in tests).

## Run it

```bash
cp .env.example .env     # then fill it in; git-ignored. Required: the database and AUTH_JWT_SECRET
./mvnw spring-boot:run  # http://localhost:8080
./mvnw test            # no database needed: tests use H2
```

Spring reads `backend/.env` when started from this folder; on a host, set the same names as real environment variables. **Every setting is explained in [`.env.example`](.env.example)**, which is the only list. The app will not start without `AUTH_JWT_SECRET`. A `config/application.properties` file also still works, for the same settings in Spring property form.

## API

Base path `/api/v1`. Everything needs `Authorization: Bearer <access token>` except the **public** endpoints marked below. Errors have one shape: `{"error": {"code": "...", "message": "..."}}`, with a message written for people.

**Auth** (`/auth`, public unless noted): `POST register`, `login`, `google`, `refresh`, `logout`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`. Signed in: `GET me`, `PATCH me` (display name), `DELETE me` (delete account).

**Account:** `GET /account/export` (all your data as JSON)

**Library:** `/ingredients` (list, `POST search`, `POST by-ids`, create, `starred`, `favorites`, star and favourite toggles), `/stash` and `/containers` (list, create, update, delete)

**Formulas:** `GET /profiles`, `GET /profiles/{id}`, `/formulas` (list, get, create, update, delete, `PUT {id}/post` to link a shared post), `/formulas/{formulaId}/versions` (list, save, delete)

**Batches** (`/batches`): list, get, create, update, delete, `POST {id}/void`, `GET lines`, `GET lot-numbers`, check-ins (`POST {id}/checks`, `PUT checks/{checkId}`, `GET checks/due`, `GET checks/due/count`)

**Community:** posts (list, get, create, edit, delete, mark answered), remixes, versions, comments, ratings (`PUT`/`DELETE {id}/rating`, bulk scores), recipes by others, reports, mutes, moderation (`GET moderator`, `GET reports/open`, `POST reports/{id}/resolve`), `GET /notifications`, `PUT /notifications/{id}/read`. Public: `GET /public/recipe-previews`

**Rules and documents:** `POST /validate`, and `POST /export/pif`, `batch`, `shopping`, `sourcing`, `batch-record` (PDFs)

## Layout

```
src/main/java/com/demiurgio/formularium/
  auth/       sign-up and sign-in, tokens, Google, Turnstile, email links, throttling
  account/    data export
  library/    ingredients, stash, containers
  formulas/   formulas, product types, versions
  batches/    batches, stash deduction, costs, check-ins
  community/  posts, comments, ratings, reports, mutes, moderation, notifications
  rules/      validation rules and interaction checks
  export/     PDF generators
  starter/    starter formulas for new accounts
  config/     security and CORS
src/test/     API tests (MockMvc, full context, H2) and rule and PDF tests
```

Every service method receives the caller's id from the verified token and puts it in the SQL, which is how ownership is enforced. See [ADR 0005](../docs/decisions/0005-authorization-in-java.md) and the [architecture notes](../docs/architecture.md).

## Database

SQL migrations live in [`../supabase/migrations`](../supabase/migrations) and are applied by hand, in order. See the [data model](../docs/data-model.md).
