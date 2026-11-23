import { test, expect } from "@playwright/test";
import { ensureOpenShift, uniquePlate } from "../support/app";

/**
 * Tariff screens: hourly blocks per vehicle type (amount + validity inline),
 * special periods, and monthly subscriptions (which charge the open shift).
 */
async function autoTab(page: import("@playwright/test").Page) {
  await page.goto("/tarifas/productos");
  await expect(page.getByRole("heading", { name: "Tarifas por vehículo" })).toBeVisible();
  await page.getByRole("navigation", { name: "Tipo de vehículo" }).getByRole("button", { name: /Auto/ }).click();
}

test("tarifas: agrega un bloque, edita monto y vigencia y lo activa/desactiva", async ({ page }) => {
  await autoTab(page);

  const blockRow = page
    .locator("tbody tr")
    .filter({ has: page.getByRole("cell", { name: "3 h", exact: true }) });

  if ((await blockRow.count()) === 0) {
    const hourlyForm = page.locator('div:has(> button:text-is("Agregar bloque"))');
    await hourlyForm.getByLabel("Horas").fill("3");
    await hourlyForm.getByLabel("Monto ARS").fill("5000");
    await hourlyForm.getByRole("button", { name: "Agregar bloque" }).click();
    await expect(blockRow).toHaveCount(1);
  }

  const row = blockRow.first();

  // Inline amount edit.
  await row.getByRole("button", { name: "Monto" }).click();
  await row.locator("input").first().fill("5100");
  await row.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(row).toContainText("5.100");

  // Temporary validity: from/to are required and must be ordered.
  await row.getByRole("button", { name: "Vigencia" }).click();
  const validity = page.locator("tr").filter({ has: page.getByRole("button", { name: "Guardar vigencia" }) });
  await validity.getByLabel("Vigencia").selectOption("Temporal");
  await validity.getByLabel("Desde").fill("2026-01-01T00:00");
  await expect(validity.getByRole("button", { name: "Guardar vigencia" })).toBeVisible();
  await validity.getByLabel("Hasta").fill("2030-01-01T00:00");
  await validity.getByRole("button", { name: "Guardar vigencia" }).click();
  await expect(row.getByText(/Temporal/)).toBeVisible();

  // Back to a fixed block (starts now, never expires).
  await row.getByRole("button", { name: "Vigencia" }).click();
  const backToFixed = page.locator("tr").filter({ has: page.getByRole("button", { name: "Guardar vigencia" }) });
  await backToFixed.getByLabel("Vigencia").selectOption("Fija (sin vencimiento)");
  await backToFixed.getByRole("button", { name: "Guardar vigencia" }).click();
  await expect(row.getByText(/Fija/)).toBeVisible();

  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByRole("button", { name: "Activar" })).toBeVisible();
  await row.getByRole("button", { name: "Activar" }).click();
  await expect(row.getByRole("button", { name: "Desactivar" })).toBeVisible();
});

test("tarifas especiales: crea un período y lo cancela", async ({ page }) => {
  const name = `E2E Feriado ${Date.now() % 100000}`;

  await page.goto("/tarifas/especiales");
  await expect(page.getByRole("heading", { name: "Tarifas especiales" })).toBeVisible();

  await page.getByPlaceholder("Nombre (ej. Feriado)").fill(name);
  await page.getByPlaceholder("% (1-100)").fill("15");
  await page.getByPlaceholder("Prioridad (menor = mayor)").fill("3");
  await page.getByLabel("Desde").fill("2026-12-24T00:00");
  await page.getByLabel("Hasta").fill("2026-12-26T00:00");

  const allTypes = page.getByRole("checkbox", { name: "Todos" });
  if (!(await allTypes.isChecked())) await allTypes.check();

  await page.getByRole("button", { name: "Crear período" }).click();

  const row = page.locator("tbody tr").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText(/Programado|Activo/)).toBeVisible();

  await row.getByRole("button", { name: "Cancelar" }).click();
  await expect(row.getByText("Cancelado")).toBeVisible();
});

test("abonados: registra un abono mensual y lo cancela", async ({ page }) => {
  await ensureOpenShift(page);
  const plate = uniquePlate("AB");

  await page.goto("/tarifas/abonados");
  await expect(page.getByRole("heading", { name: "Abonados" })).toBeVisible();

  const plan = page.getByLabel("Plan mensual");
  await expect(plan, "la sucursal E2E necesita un plan mensual").toBeEnabled();
  // With a single plan the select is already pointing at it.
  const planValue = await plan.inputValue();
  expect(planValue).toBeTruthy();
  if (!planValue) await plan.selectOption({ index: 0 });

  await page.getByLabel("Patente").fill(plate);
  await page.getByLabel("Medio de pago").selectOption({ label: "Efectivo" });
  await page.getByLabel("Desde").fill("2026-01-01");
  await page.getByLabel("Hasta").fill("2030-12-31");
  await page.getByLabel("Notas").fill("Abono E2E");

  await page.getByRole("button", { name: "Registrar abono" }).click();

  const row = page.locator("tbody tr").filter({ hasText: plate }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText("Vigente")).toBeVisible();

  await row.getByRole("button", { name: "Cancelar" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancelar abono" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar abono" }).click();
  await expect(row.getByText("Cancelado")).toBeVisible();
});
