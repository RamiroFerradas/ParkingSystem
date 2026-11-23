import { test, expect } from "@playwright/test";
import { ensureOpenShift } from "../support/app";

/**
 * Admin dashboard: the aggregate the owner looks at. Every block is rendered by
 * its own Suspense boundary, so this asserts they all resolve with data.
 */
test("el dashboard muestra ocupación, mapa, turno, métricas y accesos directos", async ({
  page,
}) => {
  await ensureOpenShift(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Estado del estacionamiento en tiempo real")).toBeVisible();

  // Occupancy: percentage, boxes and the progress bar's accessible label.
  await expect(page.getByText("Ocupación ahora")).toBeVisible();
  await expect(page.getByRole("img", { name: /% de ocupación: \d+ de \d+ boxes ocupados/ })).toBeVisible();
  await expect(page.getByText("Ocupados", { exact: true })).toBeVisible();
  await expect(page.getByText("Disponibles", { exact: true })).toBeVisible();

  // Compact box map.
  await expect(page.getByText("Mapa de boxes").first()).toBeVisible();
  await expect(page.locator("[data-box-cell]").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver mapa completo" })).toBeVisible();

  // Cash shift card (the prep opened one).
  await expect(page.getByText("Turno de caja").first()).toBeVisible();
  await expect(page.getByText("Recaudado en el turno").first()).toBeVisible();
  await expect(page.getByText("Autos adentro (sucursal)")).toBeVisible();

  // Subscriptions block and reports shortcut need `reports.read` (admin has it).
  await expect(page.getByText("Abonados", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver reportes" })).toBeVisible();

  // Today's operation, yesterday comparison and the two side panels.
  for (const label of [
    "Ingresos de hoy",
    "Egresos de hoy",
    "Recaudado hoy",
    "Ingresos de ayer",
    "Recaudado ayer",
    "Hoy vs ayer",
    "Cobros de hoy por medio",
    "Impresión pendiente",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // Quick action into the money path.
  await page.getByRole("link", { name: "Registrar ingreso" }).first().click();
  await expect(page.getByRole("heading", { name: "Registrar ingreso" })).toBeVisible();
});

test("el acceso a reportes del dashboard lleva al reporte general", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Ver reportes" }).click();

  await expect(page).toHaveURL(/\/reportes/);
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await expect(page.getByText(/período:/).first()).toBeVisible();
});
