import { defineConfig, devices } from "@playwright/test";
import { looksLikePooler, resolveDatabaseUrl } from "./e2e/support/db-target.mjs";
import { resolveE2eSchema } from "./e2e/support/schema-guard.mjs";

/**
 * E2E harness for the dashboard.
 *
 * Split of responsibilities:
 *   - `scripts/test-e2e.mjs` owns business rules over HTTP (tariffs, shifts,
 *     outbox, audit). Keep it.
 *   - this suite owns what only a browser proves: hydration, navigation,
 *     permission-driven rendering and the entry journey.
 *
 * The database target is a throwaway schema inside the disposable local
 * Postgres from `docker-compose.yml`, rebuilt from `db/migrations` on every run.
 * `resolveE2eSchema` refuses `public` and `dev`; `resolveDatabaseUrl` refuses a
 * transaction-mode pooler.
 */
const schema = resolveE2eSchema();
const databaseUrl = resolveDatabaseUrl();

/**
 * A transaction-mode pooler reuses server connections between clients, so the
 * per-connection `search_path` the app relies on silently falls back to another
 * schema. Sessions then look up the wrong tables and every page redirects to
 * /login?expired=1 under load.
 */
if (looksLikePooler(databaseUrl)) {
  throw new Error(
    "E2E_DATABASE_URL points at a transaction-mode pooler (port 6543 / pooler host). " +
      "Run the suite against a direct Postgres connection instead.",
  );
}

const port = Number(process.env.E2E_PORT ?? 3300);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const useExternalServer = Boolean(process.env.E2E_BASE_URL);

const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined),
) as Record<string, string>;

// `E2E_SKIP_BUILD=1` reuses the existing `.next` output for fast local loops.
const buildStep = process.env.E2E_SKIP_BUILD === "1" ? "" : "pnpm build && ";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Money flows: one worker, no cross-test interference. Optimize later.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalTeardown: "./e2e/global-teardown.mjs",

  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],

  // Never reuse a server that is already listening: it may be bound to `dev`.
  webServer: useExternalServer
    ? undefined
    : {
        command: `node e2e/support/schema.mjs create && ${buildStep}pnpm exec next start -p ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...env, DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema },
      },
});
