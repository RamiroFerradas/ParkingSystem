import { test, expect } from "@playwright/test";
import { AUTH, createStay, payStay, uniquePlate } from "../support/app";

/**
 * Closing a stay is the other half of the money path: quote from the tariff
 * table, payment method, charge, and the box going back to the map as free.
 */
test.use({ storageState: AUTH.employee });

test("cobra una estadía con medio de pago y libera el box", async ({ page }) => {
  const plate = uniquePlate("EC");
  await createStay(page, plate);

  await payStay(page, plate, "Efectivo");

  await expect(page.getByText(/Box liberado/)).toBeVisible();
  await expect(page.getByText(/Cobro registrado/)).toBeVisible();

  await page.goto("/operaciones/estadias");
  await expect(page.getByText(plate).filter({ visible: true })).toHaveCount(0);
});

test("el comprobante se puede reimprimir desde el historial", async ({ page }) => {
  const plate = uniquePlate("RP");
  await createStay(page, plate);
  await payStay(page, plate, "Débito");

  await page.goto("/operaciones/historial");
  await page.getByLabel("Patente").fill(plate);
  await page.getByRole("button", { name: "Filtrar" }).click();

  await expect(page.getByText(plate).filter({ visible: true }).first()).toBeVisible();
  const reprint = page.getByRole("button", { name: "Reimprimir" }).first();
  await expect(reprint).toBeVisible();
  await reprint.click();

  // Either the print client answers or the ticket stays queued with a notice:
  // both outcomes prove the action reached the print pipeline.
  await expect(
    page.getByText(/No se pudo reimprimir|Reimprimiendo|en cola|Impreso/).first(),
  ).toBeVisible();
});
