import { test, expect } from "@playwright/test";

/**
 * Read-only reporting: the overview KPIs, the box ranking, the subscription
 * impact and the shift report with its detail screen. Runs after the journeys
 * (folder order) so the period already has stays and a closed shift.
 */
test("el reporte general cambia de período, muestra KPIs y exporta CSV", async ({ page }) => {
  await page.goto("/reportes");
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();

  for (const kpi of ["Recaudación", "Cobros", "Ticket promedio", "Duración promedio"]) {
    await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Recaudación por medio de pago")).toBeVisible();
  await expect(page.getByText("Por tipo de vehículo")).toBeVisible();

  await page.getByRole("link", { name: "7 días", exact: true }).click();
  await expect(page).toHaveURL(/p=7/);
  await expect(page.getByText(/período:/).first()).toBeVisible();

  const exportLink = page.getByRole("link", { name: "Exportar CSV" }).first();
  const href = await exportLink.getAttribute("href");
  expect(href).toBeTruthy();
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"] ?? "").toContain("text/csv");
});

test("el ranking de boxes filtra por mes y pagina", async ({ page }) => {
  await page.goto("/reportes/boxes");
  await expect(page.getByRole("heading", { name: "Boxes con más movimiento" })).toBeVisible();

  for (const header of ["Box", "Sector", "Movimientos", "% del mes", "Recaudado", "Promedio"]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }

  await page.getByLabel("Mes").fill("2026-11");
  await page.getByRole("button", { name: "Ver" }).click();
  await expect(page).toHaveURL(/m=2026-11/);
  await expect(page.getByRole("navigation", { name: "Paginación del ranking" })).toBeVisible();
});

test("el impacto de abonos muestra los abonados vigentes", async ({ page }) => {
  await page.goto("/reportes/abonados");
  await expect(page.getByRole("heading", { name: "Impacto de abonos" })).toBeVisible();

  for (const card of [
    "Activos hoy",
    "Ingreso recurrente mensual",
    "Cobrado por abonos (12 meses)",
    "Vencen en 30 días",
  ]) {
    await expect(page.getByText(card, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Cobrado por abonos, por mes")).toBeVisible();
});

test("el reporte de turnos abre el detalle de un turno cerrado", async ({ page }) => {
  // Leave a closed shift behind so the report has a row to open.
  await page.request.post("/api/shifts/open", { data: {} });
  const closed = await page.request.post("/api/shifts/close", { data: { force: true } });
  expect([200, 400]).toContain(closed.status());

  await page.goto("/reportes/turnos");
  await expect(page.getByRole("heading", { name: "Reporte de turnos" })).toBeVisible();

  for (const header of ["Turno", "Abrió", "Cerró", "Duración", "Autos", "Cobros", "Facturado"]) {
    await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  }

  const detail = page.getByRole("link", { name: "Ver detalle" }).first();
  await expect(detail).toBeVisible();
  await detail.click();

  await expect(page.getByRole("heading", { name: /Turno del/ })).toBeVisible();
  await expect(page.getByText("Autos ingresados").first()).toBeVisible();
  await expect(page.getByText("Ingresos y egresos del turno")).toBeVisible();
});
