#!/usr/bin/env node
// H5: EXPLAIN ANALYZE de las queries de /reportes y /dashboard con un mes
// de datos sinteticos. Todo dentro de una transaccion con ROLLBACK: la base
// queda exactamente como estaba (tampoco deja filas en sync_outbox).
// Run: DATABASE_URL=... node scripts/explain-reports.mjs
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL requerida");
  process.exit(1);
}
const TZ = "America/Argentina/Cordoba";
const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

// datos de referencia
const { rows: types } = await c.query("SELECT id FROM vehicle_types ORDER BY code LIMIT 3");
const { rows: boxes } = await c.query("SELECT id FROM parking_boxes ORDER BY number LIMIT 4");
const { rows: methods } = await c.query("SELECT id FROM payment_methods ORDER BY code LIMIT 3");
const { rows: shifts } = await c.query("SELECT id FROM cash_shifts ORDER BY opened_at DESC LIMIT 1");
const { rows: actors } = await c.query("SELECT id FROM profiles ORDER BY role LIMIT 1");
const actor = actors[0]?.id ?? null;

await c.query("BEGIN");
try {
  // 30 dias x 200 estadias/dia = 6000 sesiones cerradas + pagos
  await c.query(
    `INSERT INTO vehicles (id, plate, vehicle_type_id)
     SELECT gen_random_uuid(), 'SYN' || lpad(rn::text, 6, '0'), t.id
       FROM generate_series(1, 6000) rn
       CROSS JOIN LATERAL (SELECT (ARRAY(SELECT id FROM vehicle_types ORDER BY code))[1 + (rn % 3)]::uuid AS id) t`,
  );
  await c.query(
    `INSERT INTO parking_sessions (id, box_id, status, entry_at, exit_at, ticket_number, vehicle_type_id, vehicle_id, opened_by, closed_by, duration_minutes, tariff_snapshot, final_amount_cents)
     SELECT gen_random_uuid(), b.id, 'closed',
            s.entry_at, s.entry_at + (s.minutes * interval '1 minute'),
            100000 + rn,
            t.id, v.id, $1, $1, s.minutes,
            jsonb_build_object('block', jsonb_build_object('name', '1HS', 'amount_cents', 158000, 'duration_minutes', 60), 'total_cents', 158000, 'extra_hours', 0),
            158000 + (s.minutes - 60) * 79000
       FROM generate_series(1, 6000) rn
       CROSS JOIN LATERAL (
         SELECT now() - ((rn % 30) || ' days')::interval - ((rn % 24) || ' hours')::interval AS entry_at,
                60 + (rn % 200) AS minutes
       ) s
       CROSS JOIN LATERAL (SELECT (ARRAY(SELECT id FROM parking_boxes ORDER BY number))[1 + (rn % 4)]::uuid AS id) b
       CROSS JOIN LATERAL (SELECT (ARRAY(SELECT id FROM vehicle_types ORDER BY code))[1 + (rn % 3)]::uuid AS id) t
       CROSS JOIN LATERAL (SELECT (ARRAY(SELECT id FROM vehicles WHERE plate LIKE 'SYN%'))[1 + (rn % 6000)]::uuid AS id) v
      WHERE NOT EXISTS (SELECT 1 FROM parking_sessions WHERE ticket_number = 100000 + rn)`,
    [actor],
  );
  await c.query(
    `INSERT INTO payments (id, session_id, amount_charged_cents, amount_calculated_cents, registered_by, method_id, shift_id, paid_at)
     SELECT gen_random_uuid(), s.id, s.final_amount_cents, s.final_amount_cents, $1,
            m.id, $2, s.exit_at
       FROM parking_sessions s
       CROSS JOIN LATERAL (SELECT (ARRAY(SELECT id FROM payment_methods ORDER BY code))[1 + (abs(hashtext(s.id::text)) % 3)]::uuid AS id) m
      WHERE s.ticket_number >= 100000 AND s.ticket_number < 200000
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.session_id = s.id)`,
    [actor, shifts[0]?.id ?? null],
  );
  const { rows: cnt } = await c.query(
    "SELECT count(*) n FROM parking_sessions WHERE ticket_number >= 100000",
  );
  console.log(`datos sinteticos: ${cnt[0].n} sesiones`);

  const QUERIES = [
    ["totals (pagos x periodo, join sesiones)",
     `SELECT count(*), COALESCE(sum(p.amount_charged_cents), 0)
        FROM payments p JOIN parking_sessions s ON s.id = p.session_id
       WHERE p.paid_at >= now() - interval '30 days'`],
    ["pagos por dia (dashboard paid_at::date)",
     `SELECT count(*) FROM payments
      WHERE (paid_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`],
    ["sesiones por dia ingreso (dashboard entry_at::date)",
     `SELECT count(*) FROM parking_sessions
      WHERE (entry_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`],
    ["por tipo vehiculo (exit_at, status closed)",
     `SELECT vt.name, count(*), COALESCE(sum(s.final_amount_cents), 0)
        FROM parking_sessions s JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
       WHERE s.status = 'closed' AND s.exit_at >= now() - interval '30 days'
       GROUP BY vt.name`],
    ["horas pico (entry_at)",
     `SELECT EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int h, count(*)
        FROM parking_sessions s
       WHERE s.entry_at >= now() - interval '30 days'
       GROUP BY h ORDER BY h`],
    ["por cajero (pagos join profiles)",
     `SELECT pr.full_name, count(*)
        FROM payments p JOIN parking_sessions s ON s.id = p.session_id
        LEFT JOIN profiles pr ON pr.id = s.closed_by
       WHERE p.paid_at >= now() - interval '30 days'
       GROUP BY pr.full_name LIMIT 15`],
  ];

  for (const [name, sql] of QUERIES) {
    const r = await c.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) ${sql}`);
    const first = r.rows[0]["QUERY PLAN"];
    const time = r.rows.find((x) => /Execution Time/.test(x["QUERY PLAN"]))?.["QUERY PLAN"];
    const seq = r.rows.some((x) => /Seq Scan on (payments|parking_sessions)\b/.test(x["QUERY PLAN"]));
    console.log(`\n== ${name} ==`);
    console.log(r.rows.map((x) => "  " + x["QUERY PLAN"]).join("\n"));
  }
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
