#!/usr/bin/env node
// Smoke del sync worker (D6): transporta el outbox a un endpoint HTTP mock,
// marca synced y no reenvía lo ya entregado (idempotencia del claim).
// Run: DATABASE_URL=... node scripts/test-sync.mjs
import { createServer } from "node:http";
import { Client } from "pg";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const workerPath = fileURLToPath(import.meta.url).replace(/test-sync\.mjs$/, "sync-worker.mjs");
const { drainOnce } = await import(pathToFileURL(workerPath).href);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL requerida");
  process.exit(1);
}

let failures = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${extra}`); }
};

// Mock cloud: devuelve 200 y cuenta qué recibió
const received = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push(JSON.parse(body));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

process.env.CLOUD_SYNC_URL = `http://127.0.0.1:${port}/`;
process.env.CLOUD_SYNC_TOKEN = "mock-token";

const db = new Client({ connectionString: DATABASE_URL });
await db.connect();

const testId = `sync-test-${Date.now()}`;
try {
  await db.query(
    `INSERT INTO sync_outbox (operation_id, entity_type, entity_id, op, payload)
     VALUES (gen_random_uuid(), 'parking_session', $1::text, 'insert',
             jsonb_build_object('id', $1::text, 'test', true))`,
    [testId],
  );

  const r1 = await drainOnce();
  ok("drain envió 1 movimiento", r1.sent === 1, JSON.stringify(r1));
  ok("mock recibió el lote", received.length === 1 && received[0].operations?.length === 1, JSON.stringify(received));

  const after = await db.query(
    `SELECT status, synced_at FROM sync_outbox WHERE entity_id = $1`,
    [testId],
  );
  ok("fila marcada synced", after.rows[0]?.status === "synced" && after.rows[0]?.synced_at !== null, JSON.stringify(after.rows));

  // fila synced ya no se reclama → no hay reenvío
  received.length = 0;
  await drainOnce();
  ok("sin reenvío de lo ya sincronizado", received.length === 0, JSON.stringify(received));

  // transporte fallando → status error + last_error, reintento con attempts
  server.close();
  const failId = `sync-test-fail-${Date.now()}`;
  await db.query(
    `INSERT INTO sync_outbox (operation_id, entity_type, entity_id, op, payload)
     VALUES (gen_random_uuid(), 'parking_session', $1::text, 'insert', jsonb_build_object('test', true))`,
    [failId],
  );
  process.env.CLOUD_SYNC_URL = "http://127.0.0.1:1/"; // puerto imposible
  const r2 = await drainOnce();
  const failed = await db.query(
    `SELECT status, attempts, last_error FROM sync_outbox WHERE entity_id = $1`,
    [failId],
  );
  ok(
    "falla de transporte → error con last_error",
    failed.rows[0]?.status === "error" && (failed.rows[0]?.attempts ?? 0) >= 1 && !!failed.rows[0]?.last_error,
    JSON.stringify(failed.rows),
  );

  await db.query(`DELETE FROM sync_outbox WHERE entity_id IN ($1, $2)`, [testId, failId]);
  console.log(failures === 0 ? "\nSYNC OK" : `\n${failures} FALLARON`);
} finally {
  server.close();
  await db.end();
}
process.exitCode = failures === 0 ? 0 : 1;
