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
  // The print client goes through Web Serial. In a headless run the API is
  // absent and the ticket falls back to the queue; in a headed run Chrome opens
  // the port picker and blocks the action. Pinning the API as absent exercises
  // the same queue path everywhere, which is what this test is about.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "serial", { value: undefined, configurable: true });
    } catch {
      /* noop */
    }
  });

  const plate = uniquePlate("RP");
  await createStay(page, plate);
  await payStay(page, plate, "Débito");

  await page.goto("/operaciones/historial");
  await page.getByLabel("Patente").fill(plate);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText(plate).filter({ visible: true }).first()).toBeVisible();

  // The reprint must reach the print pipeline (it enqueues the job first).
  const enqueued = page.waitForResponse(
    (response) =>
      response.url().includes("/api/print-jobs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Reimprimir" }).first().click();
  expect((await enqueued).ok()).toBe(true);

  await expect(page.getByText(/No se pudo reimprimir el ticket/)).toBeVisible();
});
