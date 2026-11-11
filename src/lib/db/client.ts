import { Pool } from "pg";

// Server-only singleton pool (local PostgreSQL; DATA_PLANE=local)
const globalForPool = globalThis as unknown as { __parkingPool?: Pool };

export const pool =
  globalForPool.__parkingPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
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

