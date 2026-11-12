#!/usr/bin/env node
// D6: Sync worker — drena sync_outbox hacia el endpoint cloud (Supabase).
//
// Contrato offline-first: el movimiento ya está duradero en la DB local
// (migración 006 lo encola en la misma transacción). Este worker solo
// TRANSPORTA: si falla, intenta más tarde con backoff; nunca borra nada.
//
// Modos:
//   node scripts/sync-worker.mjs --once   → un solo ciclo y sale
//   node scripts/sync-worker.mjs          → loop continuo (SYNC_INTERVAL_MS)
//
// Sin CLOUD_SYNC_URL configurado: reporta pendientes y sale 0.
// El token (service_role) vive SOLO en el servidor local (.env.local).

import { Client } from "pg";
import { pathToFileURL } from "node:url";

const LOCAL_URL = process.env.DATABASE_URL;
const BATCH = Number(process.env.SYNC_BATCH ?? 50);
const INTERVAL = Number(process.env.SYNC_INTERVAL_MS ?? 30_000);
const MAX_ATTEMPTS = Number(process.env.SYNC_MAX_ATTEMPTS ?? 20);

const once = process.argv.includes("--once");

/** Claim atómico de un lote pendiente (single-writer: FOR UPDATE SKIP LOCKED). */
async function claimBatch(client) {
  await client.query("BEGIN");
  try {
    const claimed = await client.query(
      `UPDATE sync_outbox
          SET status = 'in_process', attempts = attempts + 1
        WHERE operation_id IN (
          SELECT operation_id FROM sync_outbox
           WHERE status IN ('pending', 'error')
             AND attempts < $1
           ORDER BY created_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )
        RETURNING operation_id, entity_type, entity_id, op, payload, attempts`,
      [MAX_ATTEMPTS, BATCH],
    );
    await client.query("COMMIT");
    return claimed.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** Transporte: POST del lote al endpoint cloud. 2xx = entregado. */
async function deliver(batch) {
  const cloudUrl = process.env.CLOUD_SYNC_URL;
  const cloudToken = process.env.CLOUD_SYNC_TOKEN;
  if (!cloudUrl || !cloudToken) {
    const err = new Error("cloud no configurado (CLOUD_SYNC_URL/CLOUD_SYNC_TOKEN)");
    err.code = "NO_CLOUD_CONFIG";
    throw err;
  }
  const res = await fetch(cloudUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cloudToken}`,
      apikey: cloudToken,
    },
    body: JSON.stringify({
      operations: batch.map((r) => ({
        operation_id: r.operation_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        op: r.op,
        payload: r.payload,
        attempts: r.attempts,
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`cloud ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function drainOnce() {
  if (!LOCAL_URL) throw new Error("DATABASE_URL no configurada");
  const client = new Client({ connectionString: LOCAL_URL });
  await client.connect();
  try {
    const pending = await client.query(
      `SELECT status, count(*)::int AS n FROM sync_outbox GROUP BY status`,
    );
    const summary = Object.fromEntries(pending.rows.map((r) => [r.status, r.n]));
    const claimed = await claimBatch(client);

    if (claimed.length === 0) {
      console.log(`[sync] nada para enviar. outbox: ${JSON.stringify(summary)}`);
      return { sent: 0, failed: 0 };
    }

    try {
      await deliver(claimed);
      const ids = claimed.map((r) => r.operation_id);
      await client.query(
        `UPDATE sync_outbox SET status = 'synced', synced_at = now(), last_error = NULL
          WHERE operation_id = ANY($1::uuid[])`,
        [ids],
      );
      console.log(`[sync] enviados ${claimed.length} movimientos al cloud`);
      return { sent: claimed.length, failed: 0 };
    } catch (err) {
      if (err.code === "NO_CLOUD_CONFIG") {
        // sin cloud: devuelve el lote a pending (sin consumo de intento por config)
        const ids = claimed.map((r) => r.operation_id);
        await client.query(
          `UPDATE sync_outbox SET status = 'pending', attempts = attempts - 1
            WHERE operation_id = ANY($1::uuid[])`,
          [ids],
        );
        console.log(`[sync] ${summary.pending ?? 0} movimientos esperando cloud (no configurado)`);
        return { sent: 0, failed: 0, noCloud: true };
      }
      const ids = claimed.map((r) => r.operation_id);
      await client.query(
        `UPDATE sync_outbox SET status = 'error', last_error = $2
          WHERE operation_id = ANY($1::uuid[])`,
        [ids, String(err.message).slice(0, 500)],
      );
      console.error(`[sync] falla de transporte en ${claimed.length}: ${err.message}`);
      return { sent: 0, failed: claimed.length };
    }
  } finally {
    await client.end();
  }
}

if (isMain(process.argv[1])) {
  if (once) {
    await drainOnce();
  } else {
    for (;;) {
      try {
        await drainOnce();
      } catch (err) {
        console.error(`[sync] ciclo falló: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, INTERVAL));
    }
  }
}

function isMain(entryPath) {
  if (!entryPath) return false;
  return import.meta.url === pathToFileURL(entryPath).href;
}

export { drainOnce };
