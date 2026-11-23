import { test, expect } from "@playwright/test";
import { AUTH, boxOption, createStay, payStay, uniquePlate } from "../support/app";

/**
 * Re-entering a plate that is already parked must not create a second stay: the
 * app offers to move the vehicle to the chosen box, keeping ticket and entry
 * time (no new charge, no new ticket).
 */
test.use({ storageState: AUTH.employee });

test("ofrece mover el vehículo y conserva la misma estadía", async ({ page }) => {
  const plate = uniquePlate("MV");
  await createStay(page, plate);

  await page.goto("/operaciones/ingreso");
  const plateInput = page.getByLabel("Patente");
  await plateInput.fill(plate);
  await plateInput.blur();

  // The lookup finds the existing vehicle, so the type is fixed by the record.
  await expect(page.getByText(/Vehículo registrado/)).toBeVisible();

  const target = boxOption(page, 0);
  await expect(target, "la sucursal E2E necesita un box libre para mover").toBeVisible();
  await target.click();

  await page.getByRole("button", { name: "Confirmar ingreso" }).click();

  const prompt = page.locator("[data-move-prompt]");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText(/ya está estacionada en el box/)).toBeVisible();
  await expect(prompt.getByText(/¿Moverla al box/)).toBeVisible();

  await page.locator("[data-move-confirm]").click();

  await expect(page.getByText("Vehículo movido de box")).toBeVisible();
  await expect(page.getByText(/Se conserva la misma estadía/)).toBeVisible();

  // Clean up: the stay is charged so the box goes back to the map as free.
  await payStay(page, plate);
});
