/**
 * Fixtures for the `dev` target.
 *
 * The suite runs against the shared `dev` schema, so it must never drop or
 * recreate it and must never touch the data of the real branch. Everything it
 * needs lives in its own branch:
 *
 *   branch   E2E QA (Playwright)  code E2EQA
 *   floor    E2E Planta
 *   boxes    E2E-01 .. E2E-06
 *   tariffs  Auto 1 h / 4 h (hourly) + abono mensual
 *   users    e2e-admin / e2e-employee (this branch only) + e2e-multibranch
 *
 * `prepare` is idempotent and runs before every suite (`webServer.command`).
 * It also resets the volatile rows of that branch (open stays, payments, shifts,
 * subscriptions) so each run starts from the same state.
 *
 *   node e2e/support/dev-fixtures.mts prepare
 *   node e2e/support/dev-fixtures.mts reset
 */
import { hash } from "@node-rs/argon2";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { maskDatabaseUrl, resolveE2eTarget } from "./target.mts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCOUNTS = JSON.parse(readFileSync(join(HERE, "accounts.json"), "utf8")) as Record<
  string,
  { email: string; password: string }
>;

export const DEV_BRANCH_NAME = "E2E QA (Playwright)";
export const DEV_BRANCH_CODE = "E2EQA";
export const DEV_FLOOR_NAME = "E2E Planta";
export const DEV_BOX_NUMBERS = [
  "E2E-01",
  "E2E-02",
  "E2E-03",
  "E2E-04",
  "E2E-05",
  "E2E-06",
  "E2E-07",
  "E2E-08",
  "E2E-09",
  "E2E-10",
];

/** Monthly plan comes from the fixture, so the abono flow always has a plan. */
const MONTHLY_AMOUNT_CENTS = 9_000_000;
const HOURLY_BLOCKS = [
  { minutes: 60, cents: 280_000, name: "Auto 1 hora" },
  { minutes: 240, cents: 900_000, name: "Auto 4 horas" },
];

async function connect() {
  const target = resolveE2eTarget();
  if (target.mode !== "dev") {
    throw new Error("dev-fixtures solo aplica a E2E_TARGET=dev");
  }
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: target.databaseUrl,
    options: `-c search_path=${target.schema},public`,
  });
  try {
    await client.connect();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No se pudo conectar a la base dev en ${maskDatabaseUrl(target.databaseUrl)}: ${detail}`,
    );
  }
  return client;
}

async function tableColumns(client: import("pg").Client, table: string) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1`,
    [table],
  );
  return new Set<string>(rows.map((row: { column_name: string }) => row.column_name));
}

async function insertRow(
  client: import("pg").Client,
  table: string,
  values: Record<string, unknown>,
) {
  const allowed = await tableColumns(client, table);
  const entries = Object.entries(values).filter(([column]) => allowed.has(column));
  if (entries.length === 0) throw new Error(`No hay columnas conocidas en ${table}`);
  const columns = entries.map(([column]) => `"${column}"`).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await client.query(
    `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
    entries.map(([, value]) => value),
  );
  return rows[0];
}

async function ensureBranch(client: import("pg").Client) {
  const existing = await client.query(
    `SELECT id FROM branches WHERE code = $1 ORDER BY created_at LIMIT 1`,
    [DEV_BRANCH_CODE],
  );
  if (existing.rows[0]) return existing.rows[0].id as string;

  const branch = await insertRow(client, "branches", {
    name: DEV_BRANCH_NAME,
    code: DEV_BRANCH_CODE,
    is_active: true,
  });
  return branch.id as string;
}

async function ensureFloor(client: import("pg").Client, branchId: string) {
  const existing = await client.query(
    `SELECT id FROM parking_floors WHERE branch_id = $1 AND name = $2 LIMIT 1`,
    [branchId, DEV_FLOOR_NAME],
  );
  if (existing.rows[0]) return existing.rows[0].id as string;

  const floor = await insertRow(client, "parking_floors", {
    name: DEV_FLOOR_NAME,
    sort_order: 0,
    branch_id: branchId,
    is_active: true,
  });
  return floor.id as string;
}

async function ensureBoxes(client: import("pg").Client, branchId: string, floorId: string) {
  const types = await client.query(`SELECT id FROM vehicle_types WHERE is_active`);
  const allowedVehicleTypeIds = types.rows.map((row: { id: string }) => row.id);

  for (const number of DEV_BOX_NUMBERS) {
    const existing = await client.query(
      `SELECT id FROM parking_boxes WHERE branch_id = $1 AND number = $2 LIMIT 1`,
      [branchId, number],
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE parking_boxes
            SET is_active = true, is_service_enabled = true, floor_id = $2,
                allowed_vehicle_type_ids = $3
          WHERE id = $1`,
        [existing.rows[0].id, floorId, allowedVehicleTypeIds],
      );
      continue;
    }
    await insertRow(client, "parking_boxes", {
      number,
      sector: "E2E",
      floor_id: floorId,
      branch_id: branchId,
      allowed_vehicle_type_ids: allowedVehicleTypeIds,
      is_service_enabled: true,
      is_active: true,
    });
  }
}

async function ensureTariffs(client: import("pg").Client, branchId: string) {
  const type = await client.query(`SELECT id FROM vehicle_types WHERE code = 'AUTO' LIMIT 1`);
  const vehicleTypeId = type.rows[0]?.id as string | undefined;
  if (!vehicleTypeId) throw new Error("Falta el tipo de vehículo AUTO en la base dev");

  for (const block of HOURLY_BLOCKS) {
    const existing = await client.query(
      `SELECT id FROM parking_tariffs
        WHERE branch_id = $1 AND vehicle_type_id = $2 AND kind = 'hourly'
          AND duration_minutes = $3 AND is_active`,
      [branchId, vehicleTypeId, block.minutes],
    );
    if (existing.rows[0]) continue;
    await insertRow(client, "parking_tariffs", {
      branch_id: branchId,
      kind: "hourly",
      name: block.name,
      vehicle_type_id: vehicleTypeId,
      duration_minutes: block.minutes,
      duration_mode: "flat",
      amount_cents: block.cents,
      valid_from: new Date(),
      is_active: true,
    });
  }

  const monthly = await client.query(
    `SELECT id FROM parking_tariffs
      WHERE branch_id = $1 AND vehicle_type_id = $2 AND kind = 'monthly' AND is_active`,
    [branchId, vehicleTypeId],
  );
  if (monthly.rows.length === 0) {
    await insertRow(client, "parking_tariffs", {
      branch_id: branchId,
      kind: "monthly",
      name: "Auto abono mensual",
      vehicle_type_id: vehicleTypeId,
      duration_minutes: null,
      duration_mode: "flat",
      amount_cents: MONTHLY_AMOUNT_CENTS,
      valid_from: new Date(),
      is_active: true,
    });
  }
}

async function ensureUser(
  client: import("pg").Client,
  account: { email: string; password: string },
  fullName: string,
  role: "admin" | "employee",
  branchIds: string[],
) {
  const { hash: hashPassword } = await import("@node-rs/argon2");
  const passwordHash = await hashPassword(account.password);

  const upserted = await client.query(
    `INSERT INTO profiles (id, full_name, email, role, is_active)
     VALUES (gen_random_uuid(), $2, $1, $3::user_role, true)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true
     RETURNING id`,
    [account.email.toLowerCase(), fullName, role],
  );
  const userId = upserted.rows[0].id as string;

  await client.query(
    `INSERT INTO auth_credentials (user_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, password_updated_at = now()`,
    [userId, passwordHash],
  );

  for (const branchId of branchIds) {
    await client.query(
      `INSERT INTO user_branches (user_id, branch_id, role)
       VALUES ($1, $2, $3::user_role)
       ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, branchId, role],
    );
  }

  return userId;
}

/** Volatile rows owned by the e2e branch. Tickets, boxes, users and tariffs stay. */
export async function resetDevRunState(client: import("pg").Client, branchId: string) {
  await client.query(
    `UPDATE cash_shifts SET status = 'closed', closed_at = now()
      WHERE branch_id = $1 AND status = 'open'`,
    [branchId],
  );
  // Subscriptions are referenced by the stays they covered and by the payment
  // that charged them: unlink the stays first, then remove in FK order.
  await client.query(
    `UPDATE parking_sessions SET subscription_id = NULL WHERE branch_id = $1`,
    [branchId],
  );
  await client.query(`DELETE FROM subscriptions WHERE branch_id = $1`, [branchId]);
  await client.query(
    `DELETE FROM payments WHERE session_id IN (SELECT id FROM parking_sessions WHERE branch_id = $1)`,
    [branchId],
  );
  await client.query(
    `DELETE FROM print_jobs WHERE session_id IN (SELECT id FROM parking_sessions WHERE branch_id = $1)`,
    [branchId],
  );
  await client
    .query(
      `DELETE FROM tariff_applications WHERE session_id IN (SELECT id FROM parking_sessions WHERE branch_id = $1)`,
      [branchId],
    )
    .catch(() => {
      // La tabla puede no existir en algún esquema intermedio; no es crítico.
    });
  await client.query(`DELETE FROM parking_sessions WHERE branch_id = $1`, [branchId]);
  await client.query(`DELETE FROM special_tariff_periods WHERE branch_id = $1`, [branchId]);
  await client.query(
    `UPDATE ticket_sequences SET next_value = 1 WHERE branch_id = $1`,
    [branchId],
  );

  // Artifacts created by the specs themselves (structure + users).
  await client.query(
    `DELETE FROM parking_boxes
      WHERE floor_id IN (SELECT id FROM parking_floors WHERE branch_id = $1 AND name LIKE 'Piso E2E%')`,
    [branchId],
  );
  await client.query(
    `DELETE FROM parking_floors WHERE branch_id = $1 AND name LIKE 'Piso E2E%'`,
    [branchId],
  );

  const testUsers = `SELECT id FROM profiles WHERE email LIKE 'e2e-user-%'`;
  await client.query(`DELETE FROM audit_logs WHERE actor_id IN (${testUsers})`);
  // La auditoría de la sucursal E2E es de la suite: se limpia para que cada
  // corrida arranque como una base nueva (si no, un test depende de corridas
  // anteriores y falla en CI).
  await client.query(`DELETE FROM audit_logs WHERE branch_id = $1`, [branchId]);
  await client.query(`DELETE FROM user_permissions WHERE user_id IN (${testUsers})`);
  await client.query(`DELETE FROM user_branches WHERE user_id IN (${testUsers})`);
  await client.query(`DELETE FROM auth_credentials WHERE user_id IN (${testUsers})`);
  await client.query(`DELETE FROM profiles WHERE id IN (${testUsers})`);
}

export async function prepareDevFixtures() {
  const client = await connect();
  try {
    const branchId = await ensureBranch(client);
    const floorId = await ensureFloor(client, branchId);
    await ensureBoxes(client, branchId, floorId);
    await ensureTariffs(client, branchId);
    await resetDevRunState(client, branchId);

    const otherBranch = await client.query(
      `SELECT id FROM branches WHERE id <> $1 AND is_active ORDER BY created_at LIMIT 1`,
      [branchId],
    );

    await ensureUser(client, ACCOUNTS.admin!, "E2E Admin", "admin", [branchId]);
    await ensureUser(client, ACCOUNTS.employee!, "E2E Empleado", "employee", [branchId]);
    await ensureUser(
      client,
      ACCOUNTS.multibranch!,
      "E2E Multisucursal",
      "employee",
      otherBranch.rows[0] ? [branchId, otherBranch.rows[0].id] : [branchId],
    );

    return {
      branchId,
      branchName: DEV_BRANCH_NAME,
      boxes: DEV_BOX_NUMBERS.length,
      multibranch: Boolean(otherBranch.rows[0]),
    };
  } finally {
    await client.end();
  }
}

export async function resetDevFixtures() {
  const client = await connect();
  try {
    const branch = await client.query(`SELECT id FROM branches WHERE code = $1 LIMIT 1`, [
      DEV_BRANCH_CODE,
    ]);
    if (branch.rows[0]) await resetDevRunState(client, branch.rows[0].id);
  } finally {
    await client.end();
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const command = process.argv[2] ?? "prepare";
  if (command === "prepare") {
    const result = await prepareDevFixtures();
    console.log(
      `[e2e] dev listo: sucursal "${result.branchName}" con ${result.boxes} boxes` +
        (result.multibranch ? " (usuario multibranch incluido)" : " (sin segunda sucursal: el caso multibranch se saltea)"),
    );
  } else if (command === "reset") {
    await resetDevFixtures();
    console.log("[e2e] estado de la sucursal E2E reiniciado");
  } else {
    console.error(`[e2e] comando desconocido "${command}". Usá: prepare | reset`);
    process.exit(1);
  }
}
