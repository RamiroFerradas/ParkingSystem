# Project Context — parking-system

Parking management system for a single lot in Córdoba, Argentina. Operational web app
(entry/exit, boxes, tariffs, cash shifts, reports) over a local PostgreSQL + Supabase Cloud
sync design. Current branch: `rebuild/next-16` (rewrite; previous prototype frozen in `_legacy/`).

## Stack (verified from `package.json` / lockfile)

| Area | Reality |
|---|---|
| Framework | Next.js `16.4.6` (App Router), `cacheComponents: true`, `partialPrefetching: true` |
| UI | React `19.2.0`, Tailwind CSS 4, `@tanstack/react-table` 8 |
| Language | TypeScript 5, `strict: true`, `noUncheckedIndexedAccess: true` |
| DB access | `pg` 8 (node-postgres pool), no ORM, no generated client |
| Auth | `jose` 6 (HS256 JWT in httpOnly cookie), `@node-rs/argon2` password hashes |
| Database | PostgreSQL 16 (docker-compose local, host port 5433) + Supabase Cloud Postgres |
| Package manager | pnpm 10 (`pnpm-lock.yaml` only); CI pins Node 24 |
| Lint | `eslint-config-next` 16 flat config (`eslint.config.mjs`) |

Commands: `pnpm dev`, `pnpm build` (requires `AUTH_SECRET` + `DATABASE_URL`), `pnpm start`, `pnpm lint`.
There is no `test` script.

Next.js 16 is not the Next you know: consult `node_modules/next/dist/docs/` before writing code.
`cacheComponents: true` means request-time reads outside `<Suspense>` fail the build; cacheable
reads need `'use cache'`.

## Directory map

```
src/app/(app)/…        operational pages (boxes map, operations, tariffs, reports, admin)
src/app/login          login page
src/app/api/…          26 route.ts handlers (auth, sessions, boxes, floors, tariffs, shifts,
                       reports, users, permissions, sync, print jobs, audit logs)
src/components/        boxes, shell, pwa
src/lib/auth/          session.ts (JWT + DB revalidation), permissions.ts (matrix + per-user
                       overrides, 30s in-process cache), scope.ts (read_all vs read_own)
src/lib/db/client.ts   pg Pool singleton, max 5 (Supabase pooler session limit), optional
                       DATABASE_SCHEMA search_path
src/lib/api/guard.ts   requireUser(), Spanish RPC error mapping
src/lib/queries/       SQL query modules; src/lib/reports/ period + TZ helpers
db/migrations/         12 SQL files (001_init … 011_*)
scripts/               operational CLIs + manual node smoke/E2E scripts
```

## Schema summary (real migrations)

- **Enums**: `user_role`, `tariff_duration_mode`, `special_adjustment_type`, `special_status`,
  `session_status`, `print_job_kind`, `print_job_status`, `sync_status`, `sync_op`,
  `cash_shift_status`.
- **Identity/access**: `profiles` (role, is_active, email, version), `auth_credentials`
  (Argon2id hash), `role_permissions` (`role, permission, allowed` with `admin:*` wildcard),
  `user_permissions` (per-user allow/deny overrides), `device_registry`.
- **Catalogs/config**: `vehicle_types`, `vehicles` (normalized plate, partial unique index,
  `pg_trgm` GIN index, placeholder plates), `parking_floors`, `parking_boxes` (floor, array of
  allowed vehicle types, out-of-service flag, `is_active`), `payment_methods`, `parking_settings` (jsonb).
- **Tariffs**: `parking_tariffs` (flat blocks per vehicle type, `duration_minutes`, `amount_cents`,
  `valid_from`/`valid_to`, versioned), `special_tariff_periods` (window, percent/fixed adjustment,
  priority, status).
- **Operation**: `parking_sessions` (client-generated UUID PK, unique ticket, partial unique
  indexes: one open session per box and per vehicle, tariff snapshot jsonb, shift_id),
  `payments` (one per session, cents, discount/surcharge, shift_id), `tariff_applications`
  (immutable snapshot), `ticket_sequences` (atomic `UPDATE … RETURNING`, keyed by
  `establishment_id`, only `'default'`), `print_jobs`.
- **Shifts**: `cash_shifts` (single open shift enforced by partial unique index).
- **Audit**: `audit_logs` append-only (`REVOKE UPDATE, DELETE`).
- **Sync**: `sync_outbox` / `sync_inbox` (operation_id idempotency), `sync_conflicts`, `sync_runs`.
- **View**: `box_status` (derived available/occupied/out_of_service, floor-aware).
- **RPCs (SQL, transactional)**: `calc_fee_breakdown`, `open_session`, `close_session`,
  `quote_exit`; triggers `set_updated_at`, `require_open_shift` (no open session without an open
  cash shift). `open_session`/`close_session` also enqueue `sync_outbox` rows in the same transaction.
- **Indexes**: partial uniques for open sessions/shift, report indexes on local-date expressions
  (`AT TIME ZONE 'America/Argentina/Cordoba'`), plate trigram index.

Fee rule: largest tariff block that fits the elapsed time, plus whole extra hours charged at the
smallest active block; no block → minimum first block; validity windows respected, temporary
(`valid_to`) tariffs beat permanent ones, newest wins; result frozen into the session snapshot.

## Conventions observed in code

- Money is ARS stored as `bigint` **cents**; formatted `cents / 100` with `Intl.NumberFormat("es-AR")`.
- Timezone `America/Argentina/Cordoba` everywhere in SQL day bucketing; 24h time formatting.
- User-facing UI copy and API error messages are **Spanish (es-AR)**; code identifiers, comments,
  docs and generated artifacts are **English**.
- IDs are UUIDs, client-generated for sessions (idempotency); mutations flow through SQL RPCs.
- API handlers: `requireUser()` → permission check → manual `typeof` body validation (no Zod) →
  RPC call → typed error mapping (409/401/400).
- Permissions: `module.action` keys, admin wildcard `*`, per-user override wins, 30s process cache
  invalidated after writes on the same instance.
- Sessions: 12h stateless JWT, role/is_active re-read from `profiles` on every request (fail closed).

## Testing reality (verified, do not embellish)

- `package.json` has **no** `test` script.
- **No** vitest/jest/playwright config, **no** `*.test.*` / `*.spec.*` files, no test framework in
  `node_modules` (`@playwright/test` appears only as an optional peer of Next).
- `scripts/test-e2e.mjs`, `scripts/test-rpcs.mjs`, `scripts/test-sync.mjs` are manual node scripts;
  they require a running server and a migrated database. `.github/workflows/ci.yml` runs them after
  `pnpm build` (plus a migrations step), but they are not a test runner and there is no local
  `pnpm test`.
- Therefore: `strict_tdd: configured but unenforceable`, `test_runner: none`, `test_command: null`.
  Any test-first workflow must first introduce a runner and a real command.

## Known risks

1. **No automated unit/integration suite**; CI coverage depends on live-server smoke scripts and a
   hardcoded migration step. Refactors have no fast safety net.
2. **Migration ordering hazard**: two files share the `011_` prefix (`011_turnos_ingreso.sql`,
   `011_user_permissions.sql`); applied order is alphabetical, and CI's comment says "001..008"
   while its filter applies every `NNN_*.sql` file. Any new migration must not reuse a prefix.
3. **Single-establishment assumptions**: no `branch_id`/tenant column anywhere; `ticket_sequences`
   keyed `'default'`; one global open cash shift; global unique indexes on boxes/vehicles. A
   multi-branch change requires schema-level redesign, not just filtering.
4. **`cacheComponents: true` build strictness**: request-time DB reads outside `<Suspense>` fail
   `pnpm build`; easy to break when adding pages.
5. **Manual validation drift**: API bodies are validated ad hoc with `typeof` checks; no shared
   schema layer.
6. **Pool/connection sensitivity**: `max: 5` is deliberate for the Supabase session pooler; raising
   it risks `EMAXCONNSESSION` and dropped page blocks.
7. **Secrets in local `.env`** (git-ignored per convention); builds/CI require `AUTH_SECRET` and
   `DATABASE_URL`. Never read or print `.env` values into artifacts.
8. **Audit immutability is DB-role based**; app-level RPCs insert only, but app DB role must not
   regain UPDATE/DELETE.
