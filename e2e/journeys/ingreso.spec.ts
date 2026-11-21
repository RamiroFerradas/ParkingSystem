import { test, expect } from "@playwright/test";
import { uniquePlate } from "../support/routes";

/**
 * The money path the HTTP suite cannot prove: a real browser, real hydration,
 * real box picker, and the stay showing up on a different screen afterwards.
 *
 * Setup goes through the API on purpose (opening a cash shift is prerequisite,
 * not the behaviour under test); the assertions are all UI.
 */
test("records an entry and shows the stay on the estadías screen", async ({ page }) => {
  const opened = await page.request.post("/api/shifts/open", { data: {} });
  // 400 = a shift is already open in this branch, which is a valid starting state.
  expect([200, 400]).toContain(opened.status());

  const plate = uniquePlate();

  await page.goto("/operaciones/ingreso");
  await page.getByLabel("Patente").fill(plate);

  // The plate lookup runs on blur and resets the vehicle type, so the type is
  // chosen only once the form says which vehicle it is dealing with.
  await page.getByLabel("Patente").blur();
  await expect(page.getByText(/Vehículo nuevo/)).toBeVisible();
  const typeSelect = page.locator("#vehicleType");
  await typeSelect.selectOption({ label: "Auto" });
  await expect(typeSelect).not.toHaveValue("");

  await page.locator("[data-box-option]").first().click();
  // Picking a box must not throw away what the operator already typed.
  await expect(typeSelect).not.toHaveValue("");

  await page.getByRole("button", { name: "Confirmar ingreso" }).click();

  await expect(page.getByText("Ingreso registrado")).toBeVisible();

  await page.goto("/operaciones/estadias");
  await expect(page.getByText(plate)).toBeVisible();
});
