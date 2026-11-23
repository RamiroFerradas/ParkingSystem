import { test, expect } from "@playwright/test";
import { AUTH, createStay, payStay, uniquePlate } from "../support/app";

/**
 * Employee-scoped reading: the active stays screen, the history screen with its
 * URL filters and the CSV export that must respect the same scope.
 */
test.use({ storageState: AUTH.employee });

test("la estadía abierta figura en estadías activas", async ({ page }) => {
  const plate = uniquePlate("HI");
  await createStay(page, plate);

  await page.goto("/operaciones/estadias");
  await expect(page.getByRole("heading", { name: "Estadías activas" })).toBeVisible();
  // The desktop table is the visible layout; the mobile cards stay hidden.
  await expect(page.getByRole("cell", { name: plate })).toBeVisible();

  await payStay(page, plate);
});

test("el historial filtra por patente y exporta el CSV", async ({ page }) => {
  const plate = uniquePlate("EX");
  await createStay(page, plate);

  await page.goto("/operaciones/historial");
  await expect(page.getByRole("heading", { name: "Historial de estadías" })).toBeVisible();
  // The employee scope is announced: only the stays they registered.
  await expect(page.getByText(/Tus estadías/)).toBeVisible();

  await page.getByLabel("Patente").fill(plate);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(new RegExp(`plate=${plate}`));
  await expect(page.getByText(plate).filter({ visible: true }).first()).toBeVisible();

  const exportLink = page.getByRole("link", { name: /Exportar CSV/ });
  await expect(exportLink).toBeVisible();
  const href = await exportLink.getAttribute("href");
  expect(href).toBeTruthy();

  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toContain("text/csv");
  expect(await response.text()).toContain(plate);

  // Close the stay so the branch does not accumulate open stays between runs.
  await payStay(page, plate);
});
