/**
 * Where the Playwright suite runs.
 *
 * Two targets:
 *
 *   - `disposable` (default): a throwaway schema inside `docker-compose`'s
 *     Postgres, dropped and recreated from `db/migrations` on every run.
 *   - `dev`: the real `dev` schema on Supabase (`SUPABASE_DB_URL_DEV`), which is
 *     the environment the team develops against. It is never dropped; instead
 *     the suite owns a dedicated branch (`E2E QA (Playwright)`) and only resets
 *     rows that belong to it. `public` stays forbidden.
 *
 * A transaction-mode pooler (Supabase pgbouncer, port 6543) cannot be used for
 * the app: the per-connection `search_path` is bound to server connections that
 * are reused across clients, so session lookups intermittently resolve against
 * another schema and every page redirects to /login?expired=1 under load.
 * `resolveE2eTarget` therefore refuses that port and asks for the session-mode
 * connection (`SUPABASE_DB_URL_DEV`, port 5432).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_LOCAL_DATABASE_URL =
  "postgres://parking:parking_dev@127.0.0.1:5433/parking";

/** Schema the suite owns when it runs against the dev database. */
export const DEV_SCHEMA = "dev";

/** Schema prefix for the throwaway target. Matches `schema-guard.mts`. */
export const DISPOSABLE_SCHEMA_PATTERN = /^test_e2e_[a-z0-9_]+$/;

export type E2eMode = "disposable" | "dev";

export interface E2eTarget {
  mode: E2eMode;
  schema: string;
  databaseUrl: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Minimal dotenv reader: returns the file's values without mutating
 * `process.env`, so a caller can decide precedence itself.
 */
export function readDotEnvFiles(files = [".env.local", ".env"]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const file of files) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^"(.*)"$/, "$1");
      if (!(key in values)) values[key] = value;
    }
  }
  return values;
}

export function looksLikePooler(url: string): boolean {
  return url.includes("pooler.supabase.com:6543") || url.includes(":6543");
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  return env.E2E_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
}

export function resolveE2eMode(env: Record<string, string | undefined> = process.env): E2eMode {
  const value = (env.E2E_TARGET ?? "disposable").trim().toLowerCase();
  if (value === "disposable" || value === "dev") return value;
  throw new Error(`E2E_TARGET inválido: "${env.E2E_TARGET}". Usá "disposable" o "dev".`);
}

export function resolveE2eTarget(env: Record<string, string | undefined> = process.env): E2eTarget {
  const mode = resolveE2eMode(env);

  if (mode === "disposable") {
    return {
      mode,
      schema: env.E2E_SCHEMA ?? "test_e2e_local",
      databaseUrl: resolveDatabaseUrl(env),
    };
  }

  const dotenv = readDotEnvFiles();
  const databaseUrl =
    env.E2E_DATABASE_URL ?? dotenv.SUPABASE_DB_URL_DEV ?? dotenv.DATABASE_URL ?? env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "E2E_TARGET=dev necesita una URL de base: definí E2E_DATABASE_URL o SUPABASE_DB_URL_DEV " +
        "en .env.local (conexión directa/sesión, no el pooler transaccional).",
    );
  }
  if (looksLikePooler(databaseUrl)) {
    throw new Error(
      "E2E_TARGET=dev resolvió una conexión al pooler transaccional de Supabase (puerto 6543). " +
        "Ese modo no conserva el search_path por conexión y la app redirige a /login?expired=1 " +
        "bajo carga. Usá SUPABASE_DB_URL_DEV (puerto 5432) o pasá E2E_DATABASE_URL directo.",
    );
  }

  return { mode, schema: DEV_SCHEMA, databaseUrl };
}

/** Masked form safe to print in logs. */
export function maskDatabaseUrl(url: string): string {
  return url.replace(/\/\/[^@]*@/, "//***@");
}
