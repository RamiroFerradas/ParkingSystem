import { test, expect } from "@playwright/test";

/**
 * System screens: the append-only audit log with its filters, and the outbox /
 * sync status that the cloud worker consumes.
 */
test("la auditoría filtra por acción y muestra las columnas del registro", async ({ page }) => {
  await page.goto("/administracion/auditoria");
  await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();

  for (const header of ["Fecha", "Actor", "Acción", "Entidad", "Detalle"]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }

  await page.getByPlaceholder("Filtrar por acción (ej. tariff.)").fill("shift.");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/action=shift/);

  // Opening and closing shifts is part of the journeys, so the log has rows.
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText("shift.");
});

test("la sincronización muestra los contadores y las corridas", async ({ page }) => {
  await page.goto("/administracion/sincronizacion");
  await expect(page.getByRole("heading", { name: "Sincronización" })).toBeVisible();

  for (const label of [
    "Pendientes de envío",
    "Sincronizadas",
    "Con error",
    "A resolver",
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  for (const header of ["Inicio", "Dirección", "Enviadas", "Recibidas", "Errores"]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }

  // The status API used by the worker answers with the same data.
  const status = await page.request.get("/api/sync/status");
  expect(status.status()).toBe(200);
});
