import { defineConfig, devices } from "@playwright/test";
import { resolveE2eTarget, type E2eTarget } from "./e2e/support/target.mts";

/**
 * E2E harness for the dashboard.
 *
 * Split of responsibilities:
 *   - `scripts/test-e2e.mjs` owns business rules over HTTP (tariffs, shifts,
 *     outbox, audit). Keep it.
 *   - this suite owns what only a browser proves: hydration, navigation,
 *     permission-driven rendering and the journeys across screens.
 *
 * Two targets, selected with `E2E_TARGET`:
 *   - `disposable` (default, CI): throwaway schema inside `docker-compose`'s
 *     Postgres, rebuilt from `db/migrations` on every run.
 *   - `dev`: the shared `dev` schema on Supabase. Nothing is dropped: the suite
 *     owns a dedicated branch with its own floors, boxes, tariffs and users
 *     (`e2e/support/dev-fixtures.mts`).
 */
const target: E2eTarget = resolveE2eTarget();
const { mode, schema, databaseUrl } = target;
const isDev = mode === "dev";

const port = Number(process.env.E2E_PORT ?? 3300);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const useExternalServer = Boolean(process.env.E2E_BASE_URL);

const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined),
) as Record<string, string>;

// `E2E_SKIP_BUILD=1` reuses the existing `.next` output for fast local loops.
const buildStep = process.env.E2E_SKIP_BUILD === "1" ? "" : "pnpm build && ";
// The app must boot against the same database the fixtures prepared.
const databaseEnv = {
  DATABASE_URL: databaseUrl,
  DATABASE_SCHEMA: schema,
  // Local cookie plane: the suite speaks plain http on 127.0.0.1.
  DATA_PLANE: env.DATA_PLANE ?? "local",
};

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
  // Sign-in once per role before the run: keeps a single project, so the whole
  // suite (all employee and admin flows) is listed together.
  globalSetup: "./e2e/global-setup.mts",
  globalTeardown: "./e2e/global-teardown.mts",

  use: {
    baseURL,
    // `E2E_SLOWMO=300 pnpm test:e2e:headed` slows every action down so the run
    // can be watched in a real browser window.
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) },
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
    },
  ],

  // Never reuse a server that is already listening: it may be bound to `dev`.
  webServer: useExternalServer
    ? undefined
    : {
        command: isDev
          ? `node e2e/support/dev-fixtures.mts prepare && ${buildStep}pnpm exec next start -p ${port}`
          : `node e2e/support/schema.mts create && ${buildStep}pnpm exec next start -p ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...env, ...databaseEnv },
      },
});
