import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../support/routes";

/**
 * Renders every dashboard route as an authenticated admin and fails on the
 * things a server-side test cannot see: a crashed render, an uncaught client
 * exception, a silent redirect back to /login, or a server error page.
 */
test.describe("dashboard smoke", () => {
  for (const route of APP_ROUTES) {
    test(`${route.name} renders without crashing`, async ({ page }) => {
      const uncaught: string[] = [];
      page.on("pageerror", (error) => uncaught.push(error.message));

      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

      expect(response?.status() ?? 0, `${route.path} HTTP status`).toBeLessThan(400);
      await expect(page, `${route.path} must not bounce to login`).not.toHaveURL(/\/login/);
      await expect(page.locator("main:visible").first()).toBeVisible();
      await expect(page.getByText("Application error")).toHaveCount(0);
      expect(uncaught, `uncaught client errors on ${route.path}`).toEqual([]);
    });
  }
});
