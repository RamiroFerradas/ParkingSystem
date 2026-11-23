#!/usr/bin/env node
/**
 * Runs the browser suite against the shared `dev` database on Supabase.
 *
 *   pnpm test:e2e:dev
 *
 * Sets `E2E_TARGET=dev` for the Playwright process, which:
 *   - resolves `dev` (via `SUPABASE_DB_URL_DEV` in `.env.local`) instead of a
 *     throwaway schema,
 *   - prepares the dedicated branch fixtures before the web server starts,
 *   - never drops the schema.
 *
 * Any extra argument is forwarded to Playwright (`pnpm test:e2e:dev -- --grep ingreso`).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));

const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, E2E_TARGET: "dev" },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
