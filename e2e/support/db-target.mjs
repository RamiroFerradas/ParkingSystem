/**
 * Where the Playwright suite runs.
 *
 * The suite needs a database it can drop and recreate on every run AND a
 * connection that keeps its `search_path`. A transaction-mode pooler (Supabase
 * pgbouncer, port 6543) provides neither reliably: the startup `options` are
 * bound to server connections that are reused across clients, so requests
 * intermittently resolve against `dev` and every session lookup fails.
 *
 * Default target is the disposable Postgres from `docker-compose.yml`
 * (`docker compose up -d db`). Override with E2E_DATABASE_URL for CI.
 */
export const DEFAULT_LOCAL_DATABASE_URL =
  "postgres://parking:parking_dev@127.0.0.1:5433/parking";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveDatabaseUrl(env = process.env) {
  return env.E2E_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function looksLikePooler(url) {
  return url.includes("pooler.supabase.com") || url.includes(":6543");
}
