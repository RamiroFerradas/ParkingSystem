// tests/db/harness.mjs — DB test harness for a Supabase schema.
// Runs every test inside a transaction that always rolls back, so the `dev`
// schema is never mutated by the suite.
import { Client } from "pg";

export const TEST_SCHEMA = process.env.TEST_SCHEMA ?? "dev";

export function assertSafeTestTarget() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (use --env-file=.env.local)");
  }
  if (TEST_SCHEMA === "public") {
    throw new Error("Refusing to run tests against public: that schema is production");
  }
}

function newClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Deliberately no `public` fallback: a missing object must fail loudly
    // instead of silently resolving to the production schema.
    options: `-c search_path=${TEST_SCHEMA}`,
  });
}

export async function withRollback(fn) {
  assertSafeTestTarget();
  const client = newClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

/** Runs a statement expected to fail, isolating the failure behind a savepoint. */
export async function expectPgError(client, text, params, needle) {
  await client.query("SAVEPOINT sp_expected_error");
  try {
    await client.query(text, params);
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT sp_expected_error");
    if (!String(err.message).includes(needle)) {
      throw new Error(`expected error containing "${needle}", got "${err.message}"`);
    }
    return;
  }
  await client.query("ROLLBACK TO SAVEPOINT sp_expected_error");
  throw new Error(`expected error containing "${needle}" but the statement succeeded`);
}

/**
 * BR-022 + migration 011: no session may be opened without an open cash shift.
 * Creates one inside the test transaction when the schema has none; the rollback
 * discards it either way.
 */
export async function ensureOpenShift(client, actorId) {
  const existing = await client.query(
    "SELECT id FROM cash_shifts WHERE status = 'open' LIMIT 1",
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const branch = await client.query(
    "SELECT id FROM branches WHERE is_active ORDER BY created_at LIMIT 1",
  );
  if (branch.rows.length === 0) {
    throw new Error("dev schema has no active branch for the cash shift fixture");
  }

  const id = crypto.randomUUID();
  await client.query(
    "INSERT INTO cash_shifts (id, opened_by, branch_id) VALUES ($1, $2, $3)",
    [id, actorId, branch.rows[0].id],
  );
  return id;
}

export async function pickFixtures(client) {
  const auto = (await client.query(
    "SELECT id FROM vehicle_types WHERE code = 'AUTO'",
  )).rows[0];
  const boxes = (await client.query(
    "SELECT id, number FROM box_status WHERE status = 'available' ORDER BY number LIMIT 2",
  )).rows;
  const method = (await client.query(
    "SELECT id FROM payment_methods WHERE code = 'EFECTIVO'",
  )).rows[0];
  const actor = (await client.query(
    "SELECT id FROM profiles WHERE is_active ORDER BY created_at LIMIT 1",
  )).rows[0];

  if (!auto || boxes.length < 2 || !method || !actor) {
    throw new Error(
      "dev schema lacks seed fixtures (vehicle_types / available boxes / payment_methods / active profile)",
    );
  }
  await ensureOpenShift(client, actor.id);
  return { auto, boxes, method, actor };
}

export function plate() {
  return `T${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
