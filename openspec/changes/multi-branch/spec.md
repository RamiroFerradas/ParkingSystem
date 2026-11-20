# Spec: Multi-branch

## ADDED Requirements

### Requirement: Branch registry

The system SHALL persist branches with a stable identity, a display name, an
optional short code, an active flag, and the establishment data currently held in
`parking_settings` (address, tax id, ticket header, timezone).

All generated technical artifacts and identifiers are English. User-facing copy is
Spanish. Money is ARS stored as integer cents. Timezone is
`America/Argentina/Cordoba`.

#### Scenario: Master creates a branch

- WHEN a master submits a new branch with name `Sucursal Norte`
- THEN a `branches` row is created with `is_active = true`
- AND the branch is immediately eligible for membership assignment

#### Scenario: Duplicate branch name

- WHEN a master submits a branch whose normalized name already exists
- THEN the request is rejected with `Ya existe una sucursal con ese nombre.`
- AND no partial row is written

#### Scenario: Deactivate a branch

- WHEN a master deactivates a branch
- THEN the branch disappears from the switcher for non-masters
- AND its historical sessions, payments and shifts remain readable by the master
- AND no new session or cash shift can be opened in it

### Requirement: Per-branch membership and role

The system SHALL model membership as `user_branches (user_id, branch_id, role)`
with `role` in (`admin`, `supervisor`, `employee`). A user MAY belong to many
branches and MAY hold a different role in each. `profiles.role` SHALL no longer be
the operational source of truth after backfill.

#### Scenario: Employee assigned to two branches

- WHEN an employee is assigned to `Sucursal Norte` as `employee` and to
  `Sucursal Centro` as `supervisor`
- THEN switching to each branch grants the permissions of that branch's role
- AND permissions granted in one branch never apply in the other

#### Scenario: Membership removal

- WHEN a master removes a user from a branch
- THEN that user's next request for that branch returns `403 Acceso restringido`
- AND the user's other memberships are unaffected

### Requirement: Global master

The system SHALL support a master user flagged by `profiles.is_master`. A master
SHALL manage branches and memberships and SHALL access the consolidated console.
A master SHALL NOT be an operational member of a branch, and a user SHALL NOT be
master and branch member at the same time except through explicit membership.

#### Scenario: Master logs in

- WHEN a master logs in
- THEN they land on `/master`
- AND no operational branch is selected
- AND they can switch into any active branch to operate

#### Scenario: Non-master requests the master console

- WHEN a non-master requests `/master`
- THEN the response is `403 Acceso restringido`
- AND no branch or billing data is returned

### Requirement: Branch-scoped permission overrides

`user_permissions` SHALL be scoped by branch: `(user_id, branch_id, permission)`.
An override SHALL apply only within its branch and SHALL take precedence over the
role matrix for that branch.

#### Scenario: Override does not leak

- WHEN a master grants `report.read` to a user in `Sucursal Norte` only
- THEN the user sees reports in `Sucursal Norte`
- AND the same user is denied reports in `Sucursal Centro`

### Requirement: Active branch in session

The signed session cookie SHALL carry `activeBranchId` in addition to the user
identity. The role and permissions SHALL be resolved server-side from
`user_branches` and `user_permissions` on every request; the cookie SHALL NOT be
trusted for role.

#### Scenario: Stale cookie after membership revocation

- WHEN a valid signed cookie names a branch the user no longer belongs to
- THEN the request is rejected with `403 Acceso restringido`
- AND the user is redirected to the branch selector

#### Scenario: Session without a branch

- WHEN an authenticated non-master has no `activeBranchId`
- THEN the app routes them to the branch selector
- AND no operational page renders data

### Requirement: Branch switching

The system SHALL provide a switch operation that re-issues the session cookie for
a target branch. It SHALL be allowed only for a master or a member of that branch.

#### Scenario: Allowed switch

- WHEN a member of `Sucursal Centro` switches to `Sucursal Centro`
- THEN a new cookie with that `activeBranchId` is issued
- AND the dashboard reloads scoped to that branch

#### Scenario: Denied switch

- WHEN a user switches to a branch they do not belong to
- THEN the request is rejected with `403 Acceso restringido`
- AND the previous active branch stays in effect

### Requirement: Branch partition of operational data

Every operational row SHALL carry a non-null `branch_id`: `parking_floors`,
`parking_boxes`, `parking_sessions`, `cash_shifts`, `ticket_sequences`,
`parking_tariffs`, `special_tariff_periods`, `device_registry`.
`audit_logs.branch_id` SHALL be nullable, where `NULL` means a global master
action and SHALL never be produced by an operational write.
`payments`, `tariff_applications` and `print_jobs` SHALL remain branch-free and
SHALL be reachable only through their session.

#### Scenario: No orphan rows

- WHEN the backfill migration completes
- THEN every operational row has a non-null `branch_id`
- AND `branch_id` is a foreign key to an existing branch

#### Scenario: Cross-branch read is impossible

- WHEN any operational query runs
- THEN it is filtered by the caller's active branch
- AND a row from another branch is never returned

### Requirement: Per-branch uniqueness

Uniqueness SHALL be scoped to a branch: `(branch_id, number)` for boxes,
`(branch_id, name)` for floors, `branch_id` as the ticket sequence key, and at
most one open cash shift per branch.

#### Scenario: Same box number in two branches

- WHEN branch A creates box `01` and branch B creates box `01`
- THEN both succeed
- AND each box is visible only within its branch

#### Scenario: Two open shifts in one branch

- WHEN a shift is already open in branch A and another open is attempted
- THEN it is rejected with `Ya hay un turno abierto en esta sucursal.`
- AND a shift may be opened concurrently in branch B

### Requirement: Per-branch ticket numbering

Ticket numbers SHALL be allocated from the branch's own sequence, atomically, with
no gaps for committed sessions.

#### Scenario: Independent sequences

- WHEN branch A opens its first two sessions and branch B opens its first session
- THEN branch A tickets are `1, 2`
- AND branch B ticket is `1`

### Requirement: Per-branch tariffs

Tariff resolution SHALL select only rows belonging to the session's branch.
`calc_fee_breakdown` SHALL receive the branch id; `open_session`, `close_session`
and `quote_exit` SHALL pass the session's branch.

#### Scenario: Different prices per branch

- WHEN the same vehicle type has different active tariffs in two branches
- THEN a session is priced with its own branch's tariff
- AND no fallback to another branch's tariff occurs

#### Scenario: Missing tariff in a branch

- WHEN a branch has no active tariff for the vehicle type
- THEN the operation fails with `Sin tarifa activa para el tipo de vehículo en esta sucursal.`
- AND no session is created or closed

### Requirement: Global catalogs unchanged

`vehicle_types`, `payment_methods` and `vehicles` SHALL remain global. A vehicle
SHALL have at most one open session across the whole business.

#### Scenario: Vehicle already parked elsewhere

- WHEN a vehicle with an open session in branch A is entered in branch B
- THEN the request is rejected with `VEHICLE_PARKED` and the existing session
  reference
- AND no duplicate open session is created

### Requirement: Branch-scoped operations

Entry, exit, move, shift open/close and box administration SHALL operate only
within the caller's active branch.

#### Scenario: Box from another branch

- WHEN a user submits an entry naming a box that belongs to another branch
- THEN the request is rejected with `403 Acceso restringido`
- AND no session is created

### Requirement: Master consolidated console

`/master` SHALL show, per active branch, occupancy (occupied / total boxes),
cash shift state, and today's billing. Today's billing SHALL be defined as
collected payments today plus the projected amount of currently open sessions,
reported as two separate figures. The console SHALL be read-only.

#### Scenario: Consolidated numbers

- WHEN the master opens `/master`
- THEN each active branch shows `Ocupados`, `Caja`, `Cobrado hoy` and `En curso`
- AND no write action is offered from the console

#### Scenario: Empty branch

- WHEN a branch has no boxes
- THEN it shows `0` occupancy without an error

### Requirement: Membership administration

`/master/usuarios` SHALL let a master assign a user to branches with a role and
manage branch-scoped permission overrides.

#### Scenario: Assign and revoke

- WHEN the master assigns a user to a branch as `supervisor`
- THEN the user can switch into that branch with supervisor permissions
- AND revoking the membership removes that access on the next request

### Requirement: Backfill and idempotency

The migration SHALL create one branch named `Principal` from the current
`parking_settings` establishment row, attach all existing rows to it, and be safe
to re-run.

#### Scenario: Re-run

- WHEN the migration runs twice
- THEN the second run changes no rows and reports no error
- AND no duplicate branch or membership exists

### Requirement: Runnable verification suite

The change SHALL introduce a runnable test command with a scratch database and
SHALL pin current single-branch behavior before scoping changes land.

#### Scenario: Scoping regression

- WHEN a route loses its branch filter
- THEN at least one test fails
- AND the failure names the route and the leaked entity

## Assumptions

- A1: "facturando" means collected today and open-session projection, shown as
  separate figures. Confirmed as implementation discretion.
- A2: Branch timezone is uniform (`America/Argentina/Cordoba`) in v1; the column
  exists for future per-branch override.
- A3: Masters are created by seeding or by direct SQL in v1; there is no
  self-service master creation UI.
