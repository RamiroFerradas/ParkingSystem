# Design: Multi-branch

## 1. Schema

### 1.1 New tables

```sql
CREATE TABLE branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text,
  address       text,
  tax_id        text,
  ticket_header text,
  timezone      text NOT NULL DEFAULT 'America/Argentina/Cordoba',
  is_active     boolean NOT NULL DEFAULT true,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_branches_name ON branches (lower(btrim(name)));
CREATE UNIQUE INDEX uq_branches_code ON branches (code) WHERE code IS NOT NULL;

CREATE TABLE user_branches (
  user_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role      user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX idx_user_branches_branch ON user_branches (branch_id, role);

ALTER TABLE profiles ADD COLUMN is_master boolean NOT NULL DEFAULT false;
```

`profiles.role` is kept during the migration and dropped in a later migration
once every read path uses `user_branches`. `user_permissions` gains
`branch_id uuid NOT NULL REFERENCES branches(id)`, and its PK becomes
`(user_id, branch_id, permission)`.

### 1.2 Branch partition and uniqueness

| Table | Change | Constraint |
|---|---|---|
| `parking_floors` | add `branch_id NOT NULL` | drop global `UNIQUE(name)`; add `UNIQUE (branch_id, name)` |
| `parking_boxes` | add `branch_id NOT NULL` | drop `uq_parking_boxes_number`; add `UNIQUE (branch_id, number)` |
| `parking_sessions` | add `branch_id NOT NULL` | keep both open-session partial uniques |
| `cash_shifts` | add `branch_id NOT NULL` | drop `uq_open_cash_shift`; add partial unique on `(branch_id) WHERE status='open'` |
| `ticket_sequences` | replace `establishment_id` with `branch_id` PK | one row per branch |
| `parking_tariffs` | add `branch_id NOT NULL` | `uq_tariffs_code_active` becomes `(branch_id, code)` |
| `special_tariff_periods` | add `branch_id NOT NULL` | index `(branch_id, starts_at, ends_at, status)` |
| `device_registry` | add `branch_id NOT NULL` | — |
| `audit_logs` | add `branch_id uuid NULL` | NULL means a global master action, never an operational one |

`payments`, `tariff_applications` and `print_jobs` get no column. Their branch is
the session's branch. Denormalizing would create two sources of truth.

`vehicles` and `uq_open_session_per_vehicle` stay global on purpose: a vehicle
cannot be open in two branches.

### 1.3 Migration order (012_branches.sql)

Additive first, backfill second, tighten last. Every step is idempotent
(`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, guarded `UPDATE`).

1. Create `branches`, `user_branches`, `profiles.is_master`.
2. Seed `Principal` from the current `parking_settings` establishment row, or
   from the literal seed values when that row is absent.
3. Backfill `user_branches` from `profiles.role`, one row per user.
4. Add nullable `branch_id` to every partitioned table; `UPDATE ... SET branch_id
   = <Principal>`; then `SET NOT NULL`.
5. Create `ticket_sequences_v2 (branch_id PK, next_value)` seeded from the
   `'default'` row, then swap tables.
6. Replace uniqueness constraints with their branch-scoped versions.
7. Recreate `box_status` with `branch_id` and `JOIN branches ... is_active`.
8. Rewrite `calc_fee_breakdown`, `open_session`, `close_session`, `quote_exit`.

A pre-migration snapshot is required. Re-running the file must change no rows.

## 2. Authorization contract

```ts
// src/lib/auth/context.ts
export interface BranchContext {
  user: { id: string; email: string; name: string; isMaster: boolean };
  branchId: string | null;          // null only for a master outside a branch
  role: "admin" | "supervisor" | "employee" | null;
  can(permission: string): boolean;
}

export const getBranchContext = cache(loadBranchContext); // one load per request
export async function requireBranchContext(): Promise<BranchContext>;      // redirect/login
export async function requireBranch(permission: string): Promise<BranchContext & { branchId: string }>;
```

Rules the implementation must hold:

- The cookie carries `sub` and `activeBranchId` only. Role is **never** trusted
  from the cookie (same principle as the current `loadActiveUser`).
- `can()` resolves: `is_master` → wildcard; else `user_permissions` for this
  branch; else `role_permissions` for the branch role.
- `requireBranch` is the only way a route or page obtains a branch id. Reading a
  branch id from query parameters or request bodies is forbidden.
- A master with `branchId = null` may only reach `/master*`.
- Every API route is wrapped by `withBranch(permission, handler)` which returns
  `401` when unauthenticated, `403 Acceso restringido` when unauthorized, and
  passes a `BranchContext` with a non-null `branchId`.

`loadBranchContext` is keyed by `(userId, activeBranchId)`, so the existing React
`cache` continues to give one DB read per request. It stays inside the
authenticated layout's Suspense boundary because `cacheComponents: true`.

## 3. Routes and pages

- New: `POST /api/auth/switch-branch`, `GET /api/branches` (master),
  `POST /api/branches`, `PATCH /api/branches/:id`,
  `GET/POST /api/branch-members`, `PATCH/DELETE /api/branch-members/:id`,
  `GET /api/master/dashboard`.
- Every existing operational query gains `branch_id = $n` or joins
  `parking_sessions` and filters there. Session-derived tables are always reached
  through the session join.
- Existing scoping in `src/lib/auth/scope.ts` is extended, not replaced:
  `historialScopeForSession()` returns `{ userId, branchId, ownerId? }`.
- New pages: `/master` (console), `/master/sucursales`, `/master/usuarios`,
  `/seleccionar-sucursal` (branch selector for multi-membership users).
- Shell: branch switcher in the authenticated layout header, hidden for a master
  outside a branch.

## 4. Master console query

One RPC, one round trip, no N+1:

```sql
CREATE FUNCTION master_dashboard() RETURNS jsonb ...
-- per branch: occupied, total_boxes, shift_state,
--             collected_today (SUM payments.paid_at::date = today),
--             in_progress_cents (SUM of calc_fee_breakdown over open sessions)
```

`in_progress_cents` calls `calc_fee_breakdown` per open session; counts are small
and the call is `STABLE`. If it becomes slow, materialize a per-session cached
projection later — out of scope now.

## 5. UI states

| State | Behavior |
|---|---|
| Master, no branch | `/master`, switcher shows every active branch |
| Master, branch selected | operational shell, console still reachable |
| User, one membership | auto-select on login, no selector shown |
| User, many memberships | selector shown when `activeBranchId` is absent |
| User, zero memberships | `Acceso restringido`, no operational shell |
| Branch deactivated while active | next request clears the branch and routes to the selector |

## 6. Test strategy

- `vitest` + `pg`, `environment: node`, `tests/` at repo root.
- `TEST_DATABASE_URL` points to a scratch database; `npm test` applies migrations,
  truncates, and runs.
- Layer 1 — characterization: pin today's behavior (open/close/move, ticket
  sequence, fee calculation, reports) on a single branch.
- Layer 2 — scoping: seed two branches; assert every route and RPC rejects or
  hides foreign rows.
- Layer 3 — migration: run `012_branches.sql` twice; assert idempotency and row
  counts per branch.
- The existing `scripts/test-*.mjs` smoke scripts stay as a manual live check and
  are not promoted to `npm test`.

## 7. Alternatives considered

| Alternative | Rejected because |
|---|---|
| Postgres RLS as the boundary | `pg` + session pooler makes per-request role/GUC setup fragile; deferred as follow-up hardening |
| Schema-per-tenant | 12 migrations × N branches, no shared catalogs, far heavier operations |
| Denormalizing `branch_id` into `payments` | Two sources of truth; payment branch is derivable from the session |
| Global role plus branch list | Cannot express "admin in A, employee in B" |

## 8. Rollout

Single PR (user decision), commits per work unit. Order: harness → migration →
auth → routes → pages → master console → tests → docs. The migration is
additive-then-tighten, so a failed deploy can be rolled back to the previous
image without data loss as long as the snapshot is restored.
