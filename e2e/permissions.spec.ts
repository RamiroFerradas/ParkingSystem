import { test, expect } from "@playwright/test";

/**
 * Menu-level permissions are decided on the server and only observable in the
 * browser. An employee has `session.*` permissions but not `user.manage`, so
 * administration screens must render the restriction instead of the data.
 */
test.use({ storageState: "e2e/.auth/employee.json" });

test("employee is blocked from user administration", async ({ page }) => {
  await page.goto("/administracion/usuarios");
  await expect(page.getByText("Acceso restringido")).toBeVisible();
});

test("employee keeps working access to the ingreso screen", async ({ page }) => {
  await page.goto("/operaciones/ingreso");
  await expect(page.getByText("Acceso restringido")).toHaveCount(0);
  await expect(page.getByLabel("Patente")).toBeVisible();
});
