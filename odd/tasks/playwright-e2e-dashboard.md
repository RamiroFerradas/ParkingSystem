# Playwright E2E harness for the dashboard

Objective: prove "everything works" before a deploy without paying the
maintenance cost of a UI spec per screen.
Branch: `feat/playwright-e2e-harness` · Delivery: single PR · Runner: Playwright (chromium)

## Specs

- **S1 — Throwaway database target.** The suite always runs against a dedicated
  PostgreSQL schema matching `test_e2e_*` inside the disposable local Postgres
  from `docker-compose.yml`, rebuilt from `db/migrations` on every run and dropped
  afterwards. `public` and `dev` are refused with a hard error: "The Playwright
  suite drops and recreates its target schema". A transaction-mode pooler URL is
  refused too (see L7).
- **S2 — Never reuse a listening server.** The webServer entry must not adopt an
  already-running process, because that process may be bound to the `dev` schema.
- **S3 — Route smoke, parametrized.** Every dashboard route outside the dynamic
  `[id]` ones renders with an authenticated admin: HTTP status `< 400`, a visible
  `<main>`, no redirect to `/login`, no "Application error", and no uncaught
  client exception.
- **S4 — Authentication is established once per role.** Admin and employee
  sessions are created through the real login form ("Iniciar sesión") and stored
  as `storageState` files; individual specs never log in again.
- **S5 — Entry journey is UI-driven.** As admin: the entry screen accepts a plate
  through the "Patente" field, a vehicle type, and a box from the `data-box-option`
  picker; "Confirmar ingreso" leads to "Ingreso registrado"; the stay is visible
  on `/operaciones/estadias`.
- **S6 — Permission rendering is asserted.** The employee role lacks `user.manage`,
  so `/administracion/usuarios` renders "Acceso restringido", while
  `/operaciones/ingreso` stays usable.
- **S7 — Business rules stay in the HTTP suite.** `scripts/test-e2e.mjs` keeps
  tariffs, shift arithmetic, outbox and audit coverage; the browser suite must
  not duplicate them.
- **S8 — Secrets and state stay out of git.** `e2e/.auth/`, `test-results/`,
  `playwright-report/` and `blob-report/` are ignored.
- **S9 — CI runs everything green.** `.github/workflows/ci.yml` executes unit,
  DB, RPC/sync smoke, the Playwright suite and the HTTP e2e against a throwaway
  Postgres, with no manual step.

## Tasks

- **T1** · S1, S8 · inline · schema guard (`e2e/support/schema-guard.mjs`) with
  unit tests in `tests/unit/e2e/schema-guard.test.ts` · done · RED then GREEN,
  8/8 tests
- **T2** · S1 · inline · schema CLI (`e2e/support/schema.mjs`): drop/create,
  migrations, seed branch + admin/employee + boxes · done
- **T3** · S1, S8 · inline · `playwright.config.ts` with webServer chaining
  `schema.mjs create` before `next build` · done
- **T4** · S4 · inline · `e2e/auth.setup.ts` + `global-teardown.mjs` · done
- **T5** · S3 · inline · `e2e/smoke/routes.spec.ts` over 22 routes · done
- **T6** · S5 · inline · `e2e/journeys/ingreso.spec.ts` · done
- **T7** · S6 · inline · `e2e/permissions.spec.ts` · done
- **T8** · S7 · inline · document the layer split in the config header · done
- **T9** · S1 · inline · run the suite against a real database and confirm the
  schema round-trips · partial: schema CLI verified end-to-end (16 migrations +
  seed + login) against the cloud project; the UI run is blocked on a local
  Postgres (see L7)
- **T10** · S9 · inline · CI wiring in `.github/workflows/ci.yml`: Playwright
  step on the `postgres:16` service, browser install, artifacts on failure · done
- **T11** · S9 · inline · `scripts/ci-migrate.mjs` (idempotent, multi-schema) so
  CI keeps `public` for the app and `dev` for `tests/db` · done
- **T12** · S9 · inline · fix `test`/`test:db`/`test:all`: `node --test tests/`
  treated the directory as a file and never discovered the suite · done

## When it runs

| Moment | What runs |
|---|---|
| Pre-commit | `pnpm test:unit` (vitest). Playwright is never part of this loop. |
| CI: every push and PR | lint → unit → migrate (`public` + `dev`) → DB tests → RPC/sync smoke → Playwright → build → HTTP e2e |
| Local fast loop | `E2E_SKIP_BUILD=1 pnpm test:e2e` after one build |
| Pre-deploy | the same CI job must be green; nothing extra to remember |

## CI

`.github/workflows/ci.yml` runs on a `postgres:16-alpine` service on port 5433:

- `node scripts/ci-migrate.mjs public dev` builds both schemas in the throwaway
  database: `public` for the app and the HTTP/RPC smoke suites, `dev` for
  `tests/db/*` (the harness defaults to `dev` and refuses `public`).
- `pnpm lint` runs first: eslint exits 0 with 5 warnings (0 errors), so it gates
  real failures without blocking on style noise.
- The Playwright step sets `E2E_DATABASE_URL` explicitly and `E2E_SCHEMA=test_e2e_ci`,
  so the harness owns its schema and drops it at the end. It runs before the
  app `Build` step because it produces its own build for port 3300.
- On failure it uploads `test-results/` and `playwright-report/` (traces, video,
  screenshots) for 7 days.

## Log

- **L1** (verbatim request): "Quiero crear flujos de playwrite que testeen cada
  funcionalidad del dashboard sobre todo los modificables en la db para que se
  pueda testear que todo corre ok antes de deployar o no se como podemos manejar
  eso ? que te parece como arquitecto frontend ? tiene sentido ? cuadno se
  deberian correr?"
- **L2** Investigation: no Playwright installed; `@playwright/test` appears only
  as an optional peer of Next. Existing coverage is vitest (unit/components) plus
  a 1370-line HTTP e2e script. Decision recorded: do not translate the dashboard
  into 24 UI specs; keep the pyramid and add only the browser-only layer.
- **L3** `.env.local` points at Supabase with `DATABASE_SCHEMA=dev`, so the guard
  also refuses `dev`, not just `public`.
- **L4** Seed must create `user_branches`; without a single membership the login
  route sends users to `/seleccionar-sucursal` and every spec would fail on a
  redirect.
- **L5** Verified: `vitest run tests/unit/e2e` → 12/12 passing (schema guard and
  database-target guard).
- **L6** Verified: `node e2e/support/schema.mjs create` → "16 migrations applied",
  seed + login OK; the authenticated routes return 200 with the session cookie.
- **L7** Blocker found: with the app pointed at the Supabase transaction-mode
  pooler, the browser run redirects 15 of 22 routes to `/login?expired=1`. The
  cause is the pooler reusing server connections between clients, so the
  per-connection `search_path` intermittently resolves to another schema and the
  session lookup returns no user. Evidence: sequential curl returns 200 on every
  route, while 30 parallel requests hang and only one completes. The app's own
  pool comment documents the same exhaustion. A browser suite cannot share that
  project.
- **L8** Decision: the suite targets the disposable Postgres from
  `docker-compose.yml` (`postgres://parking:parking_dev@127.0.0.1:5433/parking`)
  by default, overridable with `E2E_DATABASE_URL`. `playwright.config.ts` refuses
  a pooler URL with an explicit error. This also keeps test data off the shared
  cloud project.
- **L9** The test schema left on the cloud project during diagnosis was dropped
  (`schema "test_e2e_local" dropped`).
- **L10** Pre-existing, out of scope: `tsc --noEmit` reports one error in
  `src/lib/api/client.ts:32` (`method !== "HEAD"` has no overlap). That file is
  untracked work in the tree, unrelated to this harness.
- **L11** Pending: run `docker compose up -d db && pnpm test:e2e` once on a
  machine with Docker available. The selectors for login, the route smoke and
  the permission screens were exercised against the cloud project; the ingreso
  journey still needs its first full run.
- **L12** CI wiring verified locally where possible: `ci.yml` parses (15 steps),
  `scripts/ci-migrate.mjs` applied all 16 migrations to a throwaway schema and
  was idempotent on re-run, and `pnpm test:db` now discovers and passes 13/13
  against the `dev` schema. The schema used for verification was dropped
  afterwards (0 `test_e2e*` schemas left on the project).
- **L13** `node --test tests/` was silently broken: Node treats a directory
  argument as a single file on Windows, so `test`/`test:db`/`test:all` never ran
  the DB suite. All three now use `"tests/db/*.test.mjs"`.
- **L14** Still pending, and only GitHub can prove it: one real CI run of the
  Playwright step (browser install + suite on the runner). Local Docker was not
  available in this session.
