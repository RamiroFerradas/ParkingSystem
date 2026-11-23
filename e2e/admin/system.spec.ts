import { test, expect } from "@playwright/test";

/**
 * System screens: the append-only audit log with its filters, and the outbox /
 * sync status that the cloud worker consumes.
 */
test("la auditoría filtra por acción y muestra las columnas del registro", async ({ page }) => {
  // Own the event instead of relying on earlier specs: on a clean database the
  // admin suite runs before any journey opens a shift.
  const opened = await page.request.post("/api/shifts/open", { data: {} });
  expect([200, 400], `abrir turno (HTTP ${opened.status()})`).toContain(opened.status());
  const closed = await page.request.post("/api/shifts/close", { data: { force: true } });
  expect([200, 400], `cerrar turno (HTTP ${closed.status()})`).toContain(closed.status());

  await page.goto("/administracion/auditoria");
  await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();

  for (const header of ["Fecha", "Actor", "Acción", "Entidad", "Detalle"]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }

  await page.getByPlaceholder("Filtrar por acción (ej. tariff.)").fill("shift.");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/action=shift/);

  const rows = page.locator("tbody tr").filter({ hasText: "shift." });
  await expect(rows.first()).toContainText("shift.");
  await expect(page.getByText("Sin eventos que coincidan.")).toHaveCount(0);
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
