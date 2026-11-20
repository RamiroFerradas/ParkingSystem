# Tasks: Multi-branch

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated authored changed lines | 2,800 – 3,200 (additions + deletions) |
| 400-line budget risk | **High** |
| Chained PRs recommended | No — user selected a single PR |
| Delivery strategy | `single-pr` |
| `size:exception` | Pre-approved by the user at SDD preflight (2026-11-20) |
| Decision needed before apply | No |
| Planned work units (commits) | 8 |

The budget is exceeded by roughly 7×. The user accepted this explicitly. Commits
still land as reviewable work units so a future split remains possible.

## Task list

Every task lands its tests and docs with the code. TDD applies where a runnable
check exists: write the failing test, observe RED, implement, observe GREEN.

---

### [ ] T0 — Test harness and baseline command

- **Depends on:** none
- **Deliverable:** `vitest` devDependency, `vitest.config.ts`, `tests/setup.ts`,
  `npm test` script, `TEST_DATABASE_URL` handling, `tests/db/helpers.ts`
  (migrate + truncate + seed).
- **TDD:** this task *is* the RED capability. Acceptance is a trivial failing
  assertion that turns green once the harness boots.
- **Acceptance:** `npm test` runs with no database and fails with a clear message;
  with a scratch database it applies migrations and runs one passing smoke test.
- **Estimated lines:** ~350

### [ ] T1 — Migration 012: branches, Principal, partition, uniqueness

- **Depends on:** T0
- **Deliverable:** `db/migrations/014_branches.sql` covering `branches`,
  `user_branches`, `profiles.is_master`, `user_permissions.branch_id`, every
  `branch_id` column, backfill from `parking_settings`, branch-scoped unique
  constraints, `ticket_sequences` swap, `box_status` recreation.
- **TDD:** migration tests written first — assert tables/columns/constraints exist
  and every operational row has `branch_id` — observed RED on the pre-migration
  schema.
- **Acceptance:** applied to a clone of production-shaped data, all rows attached
  to `Principal`, re-run changes no rows.
- **Estimated lines:** ~300

### [ ] T2 — Branch-scoped RPCs

- **Depends on:** T1
- **Deliverable:** `calc_fee_breakdown(branch, vehicle_type, elapsed)`,
  `open_session` (ticket from branch sequence, branch shift, branch box check),
  `close_session` (branch tariff), `quote_exit`, and `master_dashboard()`.
- **TDD:** RED tests for: two branches issuing independent ticket numbers;
  a tariff that exists only in branch A; an open shift in A not blocking B.
- **Acceptance:** each RPC rejects a cross-branch box or session.
- **Estimated lines:** ~180

### [ ] T3 — Branch context and authorization guard

- **Depends on:** T1
- **Deliverable:** `src/lib/auth/context.ts` (`BranchContext`, `getBranchContext`,
  `requireBranchContext`, `requireBranch`), `withBranch()` route wrapper,
  `loadActiveUser` replaced by `loadBranchContext` keyed by
  `(userId, activeBranchId)`, `scope.ts` extended with `branchId`.
- **TDD:** RED tests for: master wildcard; membership role; branch override;
  revoked membership → `403`; cookie role ignored.
- **Acceptance:** no route can obtain a branch id except through the guard.
- **Estimated lines:** ~180

### [ ] T4 — Session, login, switch, and branch selector

- **Depends on:** T3
- **Deliverable:** JWT reduced to `sub` + `activeBranchId`;
  `POST /api/auth/switch-branch`; login auto-selects a single membership; master
  lands on `/master`; `/seleccionar-sucursal` page; switcher in the app shell.
- **TDD:** RED tests for: switch to a non-member branch → `403`; switch without a
  cookie → `401`; stale branch in cookie → selector redirect.
- **Acceptance:** switching rewrites the cookie and the dashboard reflects it.
- **Estimated lines:** ~200

### [ ] T5 — Bind every query to the active branch

- **Depends on:** T3
- **Deliverable:** branch filter on every operational read and write across the
  API layer (26 handlers) and query modules; session-derived tables filtered
  through the session join.
- **TDD:** a scoping test per handler: seed branch A and B, call the handler as a
  member of A, assert no B row is ever returned or mutated.
- **Acceptance:** `grep` audit shows no operational query without a branch
  predicate; all scoping tests green.
- **Estimated lines:** ~300

### [ ] T6 — Page-level scoping and navigation

- **Depends on:** T4, T5
- **Deliverable:** page-level `requireBranch`, nav filtering by branch permission,
  empty states for a branch with no boxes or no tariffs.
- **TDD:** RED tests for each page's data loader on a two-branch fixture.
- **Acceptance:** no page renders another branch's data.
- **Estimated lines:** ~250

### [ ] T7 — Master console

- **Depends on:** T2, T4
- **Deliverable:** `/master` read-only dashboard (occupancy, cash state, collected
  today, in-progress projection per branch), read-only box map per branch.
- **TDD:** RED test on `master_dashboard()` with three branches, one empty, one
  with an open session, one with payments.
- **Acceptance:** numbers match hand-computed fixtures; no write control rendered.
- **Estimated lines:** ~220

### [ ] T8 — Branch administration

- **Depends on:** T3
- **Deliverable:** `/master/sucursales`, `GET/POST /api/branches`,
  `PATCH /api/branches/:id`; deactivation guards (no new sessions or shifts).
- **TDD:** RED tests for duplicate name, deactivation with an open shift, and
  reactivation.
- **Acceptance:** a deactivated branch disappears from the switcher and rejects
  new operations.
- **Estimated lines:** ~120

### [ ] T9 — Membership and override administration

- **Depends on:** T3
- **Deliverable:** `/master/usuarios`, `GET/POST /api/branch-members`,
  `PATCH/DELETE /api/branch-members/:id`, branch-scoped override editor.
- **TDD:** RED tests for: assign, revoke, role change, override isolation.
- **Acceptance:** revocation takes effect on the next request.
- **Estimated lines:** ~150

### [ ] T10 — Audit attribution

- **Depends on:** T1
- **Deliverable:** operational writes set `audit_logs.branch_id`; master actions
  write `NULL`; master audit view filters correctly.
- **TDD:** RED test asserting a branch filter never returns a `NULL` global row.
- **Acceptance:** every operational audit row has a branch.
- **Estimated lines:** ~60

### [ ] T11 — Characterization tests

- **Depends on:** T0
- **Deliverable:** tests pinning current single-branch behavior: entry, exit,
  move, fee calculation, reports, shift open/close.
- **TDD:** these are the pre-refactor pins; they must pass before T1 lands and
  after it lands on `Principal`.
- **Acceptance:** all characterization tests pass both before and after the
  migration.
- **Estimated lines:** ~350

### [ ] T12 — Scoping regression suite

- **Depends on:** T5
- **Deliverable:** a suite that fails when any handler loses its branch filter,
  naming the route and leaked entity.
- **TDD:** deliberately remove a filter, observe RED, restore.
- **Acceptance:** one intentional regression produces one clear failure.
- **Estimated lines:** ~250

### [ ] T13 — Docs and operational runbook

- **Depends on:** T8, T9
- **Deliverable:** `openspec/project.md` update, migration runbook (snapshot,
  apply, verify counts, rollback), master bootstrap instructions.
- **TDD:** not applicable (documentation); verified by structural readback.
- **Acceptance:** a reader can create the first master and the first branch from
  the runbook alone.
- **Estimated lines:** ~60

---

## Execution notes

- Commit boundary per task, Conventional Commits, tests and docs in the same
  commit as the behavior.
- The migration must be applied to a database clone and verified before any code
  task depends on it.
- `packages.json` gains `test`; CI gains a step that runs `npm test` against a
  service database.
