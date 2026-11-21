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
      // Known defect: /boxes/mapa hydrates with a text mismatch (React #418).
      // `src/app/(app)/boxes/mapa/page.tsx:66` formats the elapsed stay on the
      // server, so the HTML and the client render disagree. Marked as an
      // expected failure so the pipeline can gate everything else; remove this
      // annotation once the elapsed label is computed on the client.
      if (route.path === "/boxes/mapa") test.fail();
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
