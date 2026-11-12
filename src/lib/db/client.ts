import { Pool } from "pg";

// Server-only singleton pool. DATABASE_URL apunta a la DB; DATABASE_SCHEMA
// (opcional, default public) selecciona el ambiente por schema de Postgres:
// public = prod, dev = pruebas. Todo el SQL de la app es no-calificado y se
// resuelve por search_path, fijado en cada conexión nueva del pool.
const globalForPool = globalThis as unknown as { __parkingPool?: Pool };

export const pool =
  globalForPool.__parkingPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

const schema = process.env.DATABASE_SCHEMA ?? "public";
if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  throw new Error(`DATABASE_SCHEMA inválido: ${schema}`);
}
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});
pool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error("[db] client error:", err.message);
  });
  if (schema !== "public") {
    client.query(`SET search_path TO "${schema}", public`);
  }
});

if (process.env.NODE_ENV !== "production") {
  globalForPool.__parkingPool = pool;
}

export async function query<T>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

