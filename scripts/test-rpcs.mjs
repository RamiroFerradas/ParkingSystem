#!/usr/bin/env node
// Prueba de humo de los RPC operativos (Etapa D): open_session / quote_exit /
// close_session contra la base local. Determinística (manipula entry_at).
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let failures = 0;

function check(name, cond, extra = "") {
  if (cond) console.log(`✓ ${name}`);
  else {
    failures++;
    console.error(`✗ ${name} ${extra}`);
  }
}

async function expectError(name, fn, needle) {
  try {
    await fn();
    failures++;
    console.error(`✗ ${name} — no lanzó error`);
  } catch (err) {
    check(name, err.message.includes(needle), `(recibido: ${err.message})`);
  }
}

const db = (text, params) => pool.query(text, params);
const rid = () => crypto.randomUUID();

// Borra fixtures TEST-D (estadías de prueba del smoke) y sus dependencias,
// incluidas las filas de sync_outbox que el trigger genera por cada cambio.
async function cleanupFixtures(db) {
  const sessionIds = `SELECT id FROM parking_sessions WHERE exit_notes LIKE '%TEST-D%' OR entry_notes LIKE '%TEST-D%'`;
  await db(`DELETE FROM sync_outbox WHERE (entity_type = 'parking_session' AND entity_id::uuid IN (${sessionIds}))
    OR (entity_type = 'payment' AND entity_id::uuid IN (SELECT id FROM payments WHERE session_id IN (${sessionIds})))
    OR (entity_type = 'tariff_application' AND entity_id::uuid IN (SELECT id FROM tariff_applications WHERE session_id IN (${sessionIds})))`);
  await db(
    `DELETE FROM tariff_applications WHERE session_id IN (${sessionIds})`,
  );
  await db(`DELETE FROM payments WHERE session_id IN (${sessionIds})`);
  await db(`DELETE FROM parking_sessions WHERE exit_notes LIKE '%TEST-D%' OR entry_notes LIKE '%TEST-D%'`);
  await db(`DELETE FROM cash_shifts WHERE opened_by IN (SELECT id FROM profiles WHERE full_name = 'Admin Smoke')`);
  await db(`DELETE FROM vehicles WHERE plate IN ('TESTD1','TESTD2','TESTD3')`);
  await db(`DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM profiles WHERE full_name = 'Admin Smoke')`);
  await db(`DELETE FROM auth_credentials WHERE user_id IN (SELECT id FROM profiles WHERE full_name = 'Admin Smoke')`);
  await db(`DELETE FROM profiles WHERE full_name = 'Admin Smoke'`);
}

// Usuario admin de prueba propio (la DB de CI no tiene seed de usuarios).
// Se borra en finally junto con el resto de fixtures.
async function createTestAdmin(db) {
  const { hash } = await import("@node-rs/argon2");
  const pwHash = await hash("smoke-not-used-" + crypto.randomUUID());
  const { rows: [admin] } = await db(
    `INSERT INTO profiles (id, full_name, role, is_active, email)
     VALUES (gen_random_uuid(), 'Admin Smoke', 'admin', true, 'smoke-admin-' || gen_random_uuid() || '@test.local')
     RETURNING id`,
  );
  await db(`INSERT INTO auth_credentials (user_id, password_hash) VALUES ($1, $2)`, [
    admin.id,
    pwHash,
  ]);
  return admin.id;
}

try {
  // ids de referencia
  const { rows: types } = await db("SELECT id, code FROM vehicle_types ORDER BY code");
  const auto = types.find((t) => t.code === "AUTO");
  const util = types.find((t) => t.code === "UTILITARIO");
  const { rows: boxes } = await db("SELECT id, number FROM parking_boxes ORDER BY number LIMIT 2");
  const { rows: methods } = await db("SELECT id FROM payment_methods WHERE code = 'EFECTIVO'");
  await cleanupFixtures(db);
  const actor = await createTestAdmin(db);

  // Desde la migración 011, open_session exige un turno de caja abierto y la
  // base de CI arranca sin turnos: abrimos uno para la sucursal del box.
  const branchId = (
    await db(`SELECT branch_id FROM parking_boxes WHERE id = $1`, [boxes[0].id])
  ).rows[0]?.branch_id;
  if (!branchId) throw new Error("el box de prueba no tiene sucursal asignada");
  await db(
    `INSERT INTO cash_shifts (id, opened_by, branch_id) VALUES (gen_random_uuid(), $1, $2)`,
    [actor, branchId],
  );


  // --- D3: apertura ---
  const s1 = rid();
  const open1 = await db(`SELECT open_session($1,$2,$3,$4,$5,$6) r`, [
    s1, "TESTD1", auto.id, boxes[0].id, actor, "TEST-D",
  ]);
  const ticket = open1.rows[0].r.ticket_number;
  check("open_session crea estadía con ticket", Number.isInteger(ticket));

  await expectError(
    "mismo vehículo no puede tener 2 estadías",
    () => db(`SELECT open_session($1,$2,$3,$4,$5,$6) r`, [rid(), "TESTD1", auto.id, boxes[1].id, actor, null]),
    "estadía abierta",
  );
  await expectError(
    "mismo box no puede tener 2 estadías",
    () => db(`SELECT open_session($1,$2,$3,$4,$5,$6) r`, [rid(), "TESTD2", util.id, boxes[0].id, actor, null]),
    "estadía abierta",
  );

  // --- R-01: ~5 h = 4HS + 1 × 1HS (entry_at con margen: elapsed 299 min) ---
  await db(`UPDATE parking_sessions SET entry_at = now() - interval '4 hours 59 minutes' WHERE id = $1`, [s1]);
  const q5h = (await db(`SELECT quote_exit($1) r`, [s1])).rows[0].r;
  check(
    "5h → bloque 4HS + 1 extra (R-01)",
    q5h.fee.block.name.includes("4") && q5h.fee.extra_hours === 1 && q5h.fee.total_cents === 1580000,
    JSON.stringify(q5h),
  );

  // --- 13 min → mínimo 1HS completo (BR-OPEN-04) ---
  const s2 = rid();
  await db(`SELECT open_session($1,$2,$3,$4,$5,$6) r`, [s2, "TESTD2", auto.id, boxes[1].id, actor, "TEST-D"]);
  await db(`UPDATE parking_sessions SET entry_at = now() - interval '13 minutes' WHERE id = $1`, [s2]);
  const q13 = (await db(`SELECT quote_exit($1) r`, [s2])).rows[0].r;
  check("13 min → 1HS entera", q13.fee.block.duration_minutes === 60 && q13.fee.extra_hours === 0 && q13.fee.total_cents === 480000, JSON.stringify(q13));

  // --- D4: cierre atómico ---
  const closed = (await db(`SELECT close_session($1,$2,$3) r`, [s1, methods[0].id, actor])).rows[0].r;
  check("close_session cobra 1580000", closed.final_cents === 1580000n || Number(closed.final_cents) === 1580000, JSON.stringify(closed));
  const pay = await db(`SELECT amount_charged_cents, shift_id FROM payments WHERE session_id = $1`, [s1]);
  check("payment registrado", pay.rows.length === 1 && pay.rows[0].amount_charged_cents === "1580000");
  const boxFree = await db(`SELECT status FROM box_status WHERE id = $1`, [boxes[0].id]);
  check("box liberado tras el cobro", boxFree.rows[0].status === "available", boxFree.rows[0].status);

  await expectError(
    "no se puede cerrar dos veces",
    () => db(`SELECT close_session($1,$2,$3) r`, [s1, methods[0].id, actor]),
    "ya está cerrada",
  );
  const snap = await db(`SELECT tariff_snapshot FROM parking_sessions WHERE id = $1`, [s1]);
  check("snapshot tarifario inmutable guardado", snap.rows[0].tariff_snapshot?.total_cents === 1580000);

  console.log(failures === 0 ? "\nTODOS LOS CHECKS OK" : `\n${failures} CHECKS FALLARON`);
} finally {
  try {
    await cleanupFixtures((text) => pool.query(text));
  } catch (err) {
    console.error(`✗ cleanup fixtures: ${err.message}`);
  }
  await pool.end();
}
process.exitCode = failures === 0 ? 0 : 1;
