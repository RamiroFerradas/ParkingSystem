import { mkdirSync } from "node:fs";
import { test as setup, expect, type Page } from "@playwright/test";
import { ADMIN, EMPLOYEE } from "./support/seed-data.mjs";

const AUTH_DIR = "e2e/.auth";

/**
 * Signs in through the real form once per role and persists the session
 * cookie. Every other spec starts already authenticated, which removes the
 * most common source of UI-test flakiness.
 */
async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  // The form replaces the route client-side once the cookie is set.
  await expect(page).not.toHaveURL(/\/login/);
  // The authenticated shell renders two <main> elements (mobile + desktop
  // layouts), so only the visible one is a stable assertion target.
  await expect(page.locator("main:visible").first()).toBeVisible();
}

setup.beforeAll(() => {
  mkdirSync(AUTH_DIR, { recursive: true });
});

setup("authenticate as admin", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.context().storageState({ path: `${AUTH_DIR}/admin.json` });
});

setup("authenticate as employee", async ({ page }) => {
  await signIn(page, EMPLOYEE);
  await page.context().storageState({ path: `${AUTH_DIR}/employee.json` });
});
