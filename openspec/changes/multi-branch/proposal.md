# Change: Multi-branch (sucursales)

## Why

The system is single-establishment by construction, not by configuration. Every
operational concept — boxes, ticket numbering, cash shifts, tariffs, reports —
implicitly belongs to one parking lot, and authorization is a global role plus a
global per-user override.

The business now runs several locations. Each location has its own work: its own
boxes, its own cash shift, its own ticket numbering, its own tariffs. Staff are
assigned to one or more locations, and a person may hold different roles in
different locations. A master user manages the whole business (creates locations,
assigns staff) and needs one consolidated read-only view — occupancy and
today's billing per location — without becoming an operator.

### Evidence that the current model cannot host a second branch

| Constraint | Location | Consequence |
|---|---|---|
| `parking_boxes.number` is globally `UNIQUE` | `001_init.sql:82`, `005_pisos.sql:23` | Branch B cannot have box "01" |
| `ticket_sequences` keyed by `establishment_id = 'default'` | `001_init.sql:204`, `005_pisos.sql:110` | One ticket counter for all locations |
| `uq_open_cash_shift` on `(status) WHERE status='open'` | `003_shifts.sql:20` | Exactly one cash shift open in the whole business |
| `parking_floors.name` is globally `UNIQUE` | `005_pisos.sql:9` | "Planta baja" can exist only once |
| `role_permissions` / `user_permissions` are not branch-scoped | `001_init.sql:39`, `011_user_permissions.sql:7` | A role applies everywhere |
| `calc_fee_breakdown(vehicle_type_id, elapsed)` has no branch | `004_operacion.sql:20` | Tariffs cannot differ per location |
| Session JWT carries only `{userId,email,name,role}` | `src/lib/auth/session.ts:26-33` | No active branch in the session |
| Scoping helper scopes by user, never by branch | `src/lib/auth/scope.ts:12-18` | No branch filter in read paths |

## What Changes

1. **Branch registry.** New `branches` table holding the establishment identity
   that today lives in `parking_settings` (name, address, tax id, ticket header,
   timezone, active flag).
2. **Per-branch membership.** New `user_branches (user_id, branch_id, role)`
   with a composite primary key. The operational role moves here from
   `profiles.role`.
3. **Global master.** `profiles.is_master` marks the user who manages locations
   and assignments. A master is not a member of any branch; it holds no
   operational role.
4. **Per-branch permission overrides.** `user_permissions` gains `branch_id`;
   overrides apply to one branch, not globally.
5. **Per-branch data partition.** `branch_id NOT NULL` on `parking_floors`,
   `parking_boxes`, `parking_sessions`, `cash_shifts`, `ticket_sequences`,
   `parking_tariffs`, `special_tariff_periods`, `device_registry`, and
   `audit_logs` (audit branch derived from the actor's active branch).
   `payments`, `tariff_applications` and `print_jobs` stay branch-free and are
   reached through their session.
6. **Per-branch uniqueness.** `(branch_id, number)` for boxes, `(branch_id, name)`
   for floors, `branch_id` as the ticket sequence key, and a per-branch partial
   unique index for the open cash shift.
7. **Per-branch tariff resolution.** `calc_fee_breakdown` receives the branch and
   filters tariffs by it; `open_session`, `close_session` and `quote_exit` pass
   the session's branch through.
8. **Active branch in session + switcher.** The signed cookie carries
   `activeBranchId`. Switching re-issues the cookie and is rejected unless the
   user is a master or a member of the target branch.
9. **Branch-scoped authorization guard.** One helper resolves
   `{user, branchId, role, can(permission)}` per request and is the only way
   routes obtain a branch. No route may read a branch id from a query string.
10. **Master console.** `/master` shows per-branch occupancy, today's cash, and
    today's billed amount, plus a read-only box map per branch. `/master/sucursales`
    manages branches; `/master/usuarios` assigns memberships and overrides.
11. **Backfill.** Existing data migrates into one branch created from the current
    `parking_settings` row; every existing row receives that branch id. The
    migration is idempotent and reversible by snapshot.
12. **Test harness (foundational).** A runnable suite with a scratch database,
    plus characterization tests that pin today's single-branch behavior before
    any scoping change lands.

## Impact

- **Affected specs:** identity & access, operation (entry/exit/move), tariffs,
  cash shifts, boxes/floor structure, reports, administrative console.
- **Affected code:** `db/migrations` (new `012_branches`), 26 route handlers,
  18 pages, 4 transactional RPCs, `src/lib/auth/*`, `src/lib/queries/*`,
  `box_status` view, nav config.
- **Data:** every operational table gains a non-null branch. Existing rows are
  backfilled; no data is deleted.
- **Behavior visible to users:** a branch switcher appears in the shell; staff
  only see branches they belong to; master sees the console.

## Decisions

- **D1 — Operations are always inside exactly one active branch.** The master
  switches to a branch to operate, like an admin. There is no "operate on all"
  mode.
- **D2 — The master's consolidated view is read-only.** Occupancy, open cash,
  and billed-today per branch. It never mutates operational data.
- **D3 — `vehicle_types` and `payment_methods` stay global** (confirmed with the
  business).
- **D4 — `vehicles` stay global.** A plate is a real vehicle, not a per-lot
  record. The existing global `uq_open_session_per_vehicle` is intentional: a
  vehicle cannot be parked in two branches at once.
- **D5 — Role and permission overrides are per branch.** A person can be admin in
  one branch and employee in another.
- **D6 — Existing data becomes the "Principal" branch**, seeded from the current
  `parking_settings` establishment row.

## Non-goals

- No consolidated writes and no cross-branch report exports in this change.
- No per-branch `vehicle_types` or `payment_methods`.
- No database-per-tenant or schema-per-tenant isolation. Single database,
  row-level scoping.
- No Postgres Row-Level Security in this change. The app guard plus explicit
  `WHERE branch_id` is the boundary; RLS is a follow-up hardening change.
- No change to pricing rules beyond which tariff row is selected.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A route forgets the branch filter and leaks data across branches | Critical | One guard helper; `branch_id NOT NULL`; grep gate in review; scoping tests per route |
| No runnable test suite today | Critical | Task 0 builds the harness + characterization tests before any scoping edit |
| Backfill on live data | High | Idempotent migration, snapshot before apply, verified row counts per branch |
| `cacheComponents` breaks on request-time reads outside `<Suspense>` | Medium | Branch resolution stays inside the authenticated layout's Suspense boundary |
| Two migrations share the `011_` prefix | Medium | New migration uses `012_`; document the existing collision |
| Master console reads 3 aggregates per branch | Medium | Single grouped query with `GROUP BY branch_id`; no N+1 |
