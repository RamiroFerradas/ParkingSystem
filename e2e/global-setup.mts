import { mkdirSync, readFileSync } from "node:fs";
import { request, expect } from "@playwright/test";

/**
 * Signs in once per role through the real login endpoint and persists the
 * session cookie, so every spec starts already authenticated.
 *
 * This runs as `globalSetup` (Playwright starts the web server first), which
 * keeps the suite in a single project: the UI shows every flow directly instead
 * of a separate `setup` project with only the three sign-ins.
 *
 * The login *form* is covered by `e2e/smoke/login.spec.ts`; here we only need
 * the cookie.
 */
const ACCOUNTS = JSON.parse(
  readFileSync(new URL("./support/accounts.json", import.meta.url), "utf8"),
) as Record<"admin" | "employee" | "multibranch", { email: string; password: string }>;

const AUTH_DIR = "e2e/.auth";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3300}`;

const ROLES = [
  ["admin", ACCOUNTS.admin],
  ["employee", ACCOUNTS.employee],
  ["multibranch", ACCOUNTS.multibranch],
] as const;

export default async function globalSetup() {
  mkdirSync(AUTH_DIR, { recursive: true });

  for (const [role, account] of ROLES) {
    const context = await request.newContext({ baseURL: BASE_URL });
    try {
      const response = await context.post("/api/auth/login", {
        data: { email: account.email, password: account.password },
      });
      expect(response.status(), `login de ${role} (${account.email})`).toBe(200);
      await context.storageState({ path: `${AUTH_DIR}/${role}.json` });
    } finally {
      await context.dispose();
    }
  }
}
