import { test, expect } from "@playwright/test";
import { createStay, payStay, uniquePlate } from "../support/app";

/**
 * Vehicle listing: the vehicle is created implicitly by the first entry (there
 * is no manual form), and the screen searches by plate.
 */
test("el listado de vehículos busca la patente que entró", async ({ page }) => {
  const plate = uniquePlate("VH");
  await createStay(page, plate);

  await page.goto("/vehiculos");
  await expect(page.getByRole("heading", { name: "Vehículos" })).toBeVisible();

  const search = page.getByPlaceholder("Buscar patente…");
  await search.fill(plate);

  const row = page.locator("tbody tr").filter({ hasText: plate }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Auto");

  // A plate that does not exist reports it instead of keeping stale rows.
  await search.fill("ZZZZZZ");
  await expect(page.getByText("Sin resultados")).toBeVisible();

  // Cleanup: charge the stay so the branch keeps its boxes free.
  await payStay(page, plate);
});
