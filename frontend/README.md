# Formularium frontend

The React app for [Formularium](../README.md): the formula studio, batches, stash, community and public guides. It talks only to the Spring Boot API in [`../backend`](../backend); there is no other backend.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7, Vitest + Testing Library (happy-dom).

## Run it

```bash
npm ci
cp .env.example .env.local     # then fill it in
npm run dev                    # http://localhost:5173
```

The API must be running too (default `http://localhost:8080`, see the [backend README](../backend/README.md)).

Every variable is explained in [`.env.example`](.env.example), which is the only list. They are baked into the bundle and visible to anyone, so only public values belong there; real secrets live in the backend. `.env.local` is git-ignored.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | All tests once (`vitest run`) |
| `npm run lint` | ESLint |
| `npm run build` | Type-check (`tsc -b`), build, then prerender the public pages |
| `npm run preview` | Serve the production build locally |
| `npm run build:annex3` | Regenerate the EU Annex III limits data |

## How the code is organised

```
src/
  pages/        One file per route (studio, batches, stash, community, guides...)
  components/   UI pieces, grouped by area (editor, bench, metrics, pantry, tools...)
  lib/          Plain TypeScript with no React: the API clients, calculators,
                auto-balancing, regional limits, batch planning, parsers
  hooks/        React glue around lib/ (autosave, bench session, data loading)
  contexts/     Auth, settings and dialog state
  content/      Guides, blog articles and the legal texts
  seo/          Per-page titles, meta tags, structured data and prerender
  db/           SQL migration tests run on an in-process Postgres (PGlite)
```

A few conventions worth knowing:

- **Domain logic stays out of components.** Calculations and rules live in `lib/` as small functions with their own tests, so they can be checked without rendering anything.
- **One door to the backend.** `lib/apiClient.ts` (`request`) adds the access token, turns error responses into `ApiError` with a message safe to show, and retries once after a silent token refresh. Feature modules (`formulasApi`, `libraryApi`, `batches`, `communityApi`) build on it, and components never call `fetch` themselves.
- **Auth.** The short-lived access token lives only in memory (`lib/authClient.ts`). The refresh token is an HttpOnly cookie that scripts cannot read, so a page reload quietly signs you back in. Parallel requests that hit an expired token share a single refresh.
- **Work is not lost.** The editor autosaves, keeps a local draft, and records version history that can be restored.

## Tests

`npm test` runs everything (1,600+ tests). A few patterns:

- **Component and page tests** use Testing Library and mock the API modules (`vi.mock('../lib/communityApi')`), so they drive the UI the way a person does and need no server.
- **`lib/` tests** are plain unit tests with no DOM.
- **`db/*.sql.test.ts`** apply the SQL migrations from `../supabase/migrations` to a real Postgres engine (PGlite) and check what they do. A migration's file is copied into `src/db/fixtures/` for the test.

## Public pages and SEO

The app is a single-page app, but the landing page, guides, blog and legal pages are prerendered at the end of `vite build` (`scripts/prerenderPages.ts`). Each gets its own HTML with title, description, canonical link, social tags, structured data and readable content, plus a `sitemap.xml` and `llms.txt`. Set `VITE_SITE_URL` for production builds so the absolute links can be written.
