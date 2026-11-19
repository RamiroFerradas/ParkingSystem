import { Pool } from "pg";

// Server-only singleton pool. DATABASE_URL apunta a la DB; DATABASE_SCHEMA
// (opcional, default public) selecciona el ambiente por schema de Postgres:
// public = prod, dev = pruebas.
const globalForPool = globalThis as unknown as { __parkingPool?: Pool };

const schema = process.env.DATABASE_SCHEMA ?? "public";
if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  throw new Error(`DATABASE_SCHEMA inválido: ${schema}`);
}

export const pool =
  globalForPool.__parkingPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // El pooler de Supabase en modo sesión corta en ~15 clientes por proyecto.
    // Un pool chico reusa conexiones y deja margen para el resto del proyecto;
    // antes un pool grande bajo concurrencia agotaba el cupo (EMAXCONNSESSION)
    // y las páginas perdían bloques enteros.
    max: 5,
    idleTimeoutMillis: 30_000,
    // El search_path viaja en el paquete de arranque: cada conexión nace con el
    // schema correcto. Antes se disparaba un `SET search_path` sin await desde
    // pool.on("connect"), lo que corría una carrera con la primera consulta
    // (de ahí "client is already executing a query") y dejaba conexiones
    // colgadas hasta agotar el pooler.
    ...(schema === "public" ? {} : { options: `-c search_path=${schema},public` }),
  });

// Cachear también en producción: sin esto, cada bundle de Next crea su propio
// pool y las conexiones al pooler se multiplican por bundle.
globalForPool.__parkingPool = pool;

pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

export async function query<T>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
