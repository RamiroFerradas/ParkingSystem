import { test, expect } from "@playwright/test";
import { AUTH, resetShiftAsAdmin, toast, withAdminContext } from "../support/app";

/**
 * Cash shifts: the employee manages their own shift (open, close) but cannot
 * close someone else's; admin and supervisor can close any.
 */
test.use({ storageState: AUTH.employee });

test("el empleado abre y cierra su propio turno", async ({ page, browser }) => {
  await resetShiftAsAdmin(browser);

  await page.goto("/administracion/turnos");
  await expect(page.getByRole("heading", { name: "Turnos de caja" })).toBeVisible();
  await expect(page.getByText("No hay turno abierto")).toBeVisible();

  await page.getByLabel("Notas de apertura (opcional)").fill("Apertura E2E");
  // The page action and the header chip both say "Abrir turno".
  await page.getByRole("button", { name: "Abrir turno" }).last().click();
  await expect(toast(page, "Turno abierto")).toBeVisible();
  await expect(page.getByText("Turno abierto", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Notas de cierre (opcional)").fill("Cierre E2E");
  await page.getByRole("button", { name: "Cerrar turno" }).last().click();

  // With vehicles still inside the app asks for confirmation before closing.
  const confirm = page.getByRole("button", { name: /Cerrar turno igual|Confirmar cierre/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  await expect(toast(page, /Turno cerrado/)).toBeVisible();
  await expect(page.getByText("No hay turno abierto")).toBeVisible();
});

test("el empleado no puede cerrar el turno que abrió otro usuario", async ({ page, browser }) => {
  await resetShiftAsAdmin(browser);
  await withAdminContext(browser, async (request) => {
    const response = await request.post("/api/shifts/open", { data: {} });
    expect(response.status()).toBe(200);
  });

  await page.goto("/administracion/turnos");
  await expect(page.getByText(/Solo .* puede cerrar este turno/)).toBeVisible();
});
