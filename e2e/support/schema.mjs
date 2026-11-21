#!/usr/bin/env node
/**
 * Builds and tears down the throwaway Postgres schema the Playwright suite runs
 * against.
 *
 *   node e2e/support/schema.mjs create
 *   node e2e/support/schema.mjs drop
 *
 * The schema is dropped and recreated from `db/migrations` on every run, then
 * seeded with one branch, two accounts (admin/employee) and four boxes. The
 * name always comes from `schema-guard.mjs`, which refuses `public` and `dev`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN, EMPLOYEE } from "./seed-data.mjs";
import { resolveDatabaseUrl } from "./db-target.mjs";
import { resolveE2eSchema } from "./schema-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(ROOT, "db", "migrations");
const BOX_NUMBERS = ["01", "02", "03", "04"];

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

/**
 * Opens a client already positioned on the target schema.
 * `options` travels in the startup packet, so it survives a transaction-mode
 * pooler (Supabase's pgbouncer) where a later `SET search_path` would not.
 * @param {string} schema
 */
async function connect(schema) {
  loadEnv();
  const connectionString = resolveDatabaseUrl();
  const { Client } = await import("pg");
  const client = new Client({ connectionString, options: `-c search_path=${schema},public` });
  try {
    await client.connect();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach the e2e database at ${connectionString.replace(/\/\/[^@]*@/, "//***@")}: ${detail}. ` +
        "Start the disposable database first: `docker compose up -d db`, " +
        "or point E2E_DATABASE_URL at a direct (non-pooler) Postgres connection.",
    );
  }
  return client;
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Column names of a table in the target schema. Used to build inserts that
 * survive migration drift instead of hardcoding a column list.
 * @param {import("pg").Client} client
 * @param {string} schema
 * @param {string} table
 * @returns {Promise<Set<string>>}
 */
async function tableColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Set(rows.map((row) => row.column_name));
}

/**
 * Inserts only the columns that actually exist in this schema.
 * @param {import("pg").Client} client
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} values
 */
async function insertRow(client, schema, table, values) {
  const allowed = await tableColumns(client, schema, table);
  const entries = Object.entries(values).filter(([column]) => allowed.has(column));
  if (entries.length === 0) throw new Error(`No known columns to insert into ${table}`);

  const columns = entries.map(([column]) => `"${column}"`).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await client.query(
    `INSERT INTO "${schema}"."${table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
    entries.map(([, value]) => value),
  );
  return rows[0];
}

async function ensureBranch(client, schema) {
  const existing = await client.query(
    `SELECT id FROM "${schema}"."branches" ORDER BY created_at LIMIT 1`,
  );
  if (existing.rows[0]) return existing.rows[0];

  return insertRow(client, schema, "branches", {
    name: "Principal",
    code: "PRINCIPAL",
    is_active: true,
  });
}

async function ensureUser(client, schema, account, role, branchId) {
  const { hash } = await import("@node-rs/argon2");

  // The schema is fresh on every run; the delete keeps a manual re-seed idempotent.
  await client.query(`DELETE FROM "${schema}"."profiles" WHERE email = $1`, [account.email]);

  const profile = await insertRow(client, schema, "profiles", {
    id: crypto.randomUUID(),
    full_name: role === "admin" ? "E2E Admin" : "E2E Employee",
    role,
    is_active: true,
    email: account.email,
  });

  await insertRow(client, schema, "auth_credentials", {
    user_id: profile.id,
    password_hash: await hash(account.password),
  });

  // Exactly one membership: the login route auto-selects the branch instead of
  // sending the user to /seleccionar-sucursal.
  await client.query(
    `INSERT INTO "${schema}"."user_branches" (user_id, branch_id, role)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [profile.id, branchId, role],
  );

  return profile;
}

async function ensureBoxes(client, schema, branchId) {
  const floors = await client.query(
    `SELECT id FROM "${schema}"."parking_floors" ORDER BY sort_order LIMIT 1`,
  );
  const floor =
    floors.rows[0] ??
    (await insertRow(client, schema, "parking_floors", {
      name: "Planta baja",
      sort_order: 0,
      branch_id: branchId,
    }));

  const boxes = await client.query(`SELECT count(*)::int AS total FROM "${schema}"."parking_boxes"`);
  if (boxes.rows[0].total > 0) return;

  const vehicleTypes = await client.query(
    `SELECT id FROM "${schema}"."vehicle_types" ORDER BY sort_order`,
  );
  const allowedVehicleTypeIds = vehicleTypes.rows.map((row) => row.id);

  for (const number of BOX_NUMBERS) {
    await insertRow(client, schema, "parking_boxes", {
      number,
      sector: "Planta baja",
      floor_id: floor.id,
      branch_id: branchId,
      allowed_vehicle_type_ids: allowedVehicleTypeIds,
      is_service_enabled: true,
      is_active: true,
    });
  }
}

/**
 * Drops the schema if it exists, recreates it, applies every migration and
 * seeds the minimum the UI needs to operate.
 * @param {string} schema
 */
export async function createSchema(schema) {
  const client = await connect(schema);
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}"`);

    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      // Same query string: one backend, so search_path cannot drift between
      // the SET and the migration body on a transaction-mode pooler.
      await client.query(`SET search_path TO "${schema}", public;\n${sql}`);
    }

    const branch = await ensureBranch(client, schema);
    await ensureUser(client, schema, ADMIN, "admin", branch.id);
    await ensureUser(client, schema, EMPLOYEE, "employee", branch.id);
    await ensureBoxes(client, schema, branch.id);

    return { schema, migrations: migrationFiles().length };
  } finally {
    await client.end();
  }
}

/**
 * @param {string} schema
 */
export async function dropSchema(schema) {
  const client = await connect(schema);
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const command = process.argv[2] ?? "create";
  const schema = resolveE2eSchema();

  if (command === "create") {
    const result = await createSchema(schema);
    console.log(`[e2e] schema "${result.schema}" ready (${result.migrations} migrations applied)`);
  } else if (command === "drop") {
    await dropSchema(schema);
    console.log(`[e2e] schema "${schema}" dropped`);
  } else {
    console.error(`[e2e] unknown command "${command}". Use: create | drop`);
    process.exit(1);
  }
}
