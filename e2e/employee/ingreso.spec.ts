import { test, expect } from "@playwright/test";
import {
  AUTH,
  BOX_PREFIX,
  boxOption,
  ensureOpenShift,
  payStay,
  resetShiftAsAdmin,
  uniquePlate,
} from "../support/app";

/**
 * The money path the HTTP suite cannot prove: a real browser, real hydration,
 * real box picker, plate sanitising and the stay showing up on another screen.
 */
test.use({ storageState: AUTH.employee });

test("sin turno abierto el ingreso avisa y ofrece abrirlo", async ({ page, browser }) => {
  await resetShiftAsAdmin(browser);

  await page.goto("/operaciones/ingreso");
  await expect(page.getByText("No hay turno de caja abierto")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir turno de caja" })).toBeVisible();

  await page.getByRole("link", { name: "Abrir turno de caja" }).click();
  await expect(page.getByRole("heading", { name: "Turnos de caja" })).toBeVisible();
  // The header chip and the page form both say "Abrir turno"; the form is the
  // one inside the content area.
  await page.locator("#contenido").getByRole("button", { name: "Abrir turno" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Turno abierto" }).first()).toBeVisible();

  await page.goto("/operaciones/ingreso");
  await expect(page.getByText("No hay turno de caja abierto")).toHaveCount(0);
});

test("sanea la patente, filtra boxes y registra el ingreso", async ({ page }) => {
  await ensureOpenShift(page);

  await page.goto("/operaciones/ingreso");
  const plateInput = page.getByLabel("Patente");
  // A fresh plate each run: an already-registered vehicle would skip the type
  // selector and show "Vehículo registrado" instead of "Vehículo nuevo".
  const plate = uniquePlate("AB");
  const dirty = `${plate.slice(0, 2).toLowerCase()} ${plate.slice(2, 4)}-${plate.slice(4)}`;

  // Spaces and dashes are stripped and the value is uppercased.
  await plateInput.fill(dirty);
  await expect(plateInput).toHaveValue(plate);

  await plateInput.blur();
  await expect(page.getByText(/Vehículo nuevo/)).toBeVisible();

  const typeSelect = page.locator("#vehicleType");
  await typeSelect.selectOption({ label: "Auto" });
  await expect(typeSelect).not.toHaveValue("");

  // The picker filters by number and tells the operator when nothing matches.
  await page.locator("#box-filter").fill("ZZZ");
  await expect(page.getByText(/Ningún box coincide con «ZZZ»/)).toBeVisible();
  await page.locator("#box-filter").fill("");

  // Only boxes of the active branch are offered: another branch's box would be
  // rejected by the server, so showing it would be a dead end.
  if (BOX_PREFIX) {
    const offered = (await page.locator("[data-box-option]:visible").allInnerTexts()).filter(
      (text) => text.trim().length > 0,
    );
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((text) => text.includes(BOX_PREFIX))).toBe(true);
  }

  const box = boxOption(page);
  await expect(box).toBeVisible();
  await box.click();
  await expect(page.getByText(/Box .+ elegido/)).toBeVisible();
  // Picking a box must not throw away what the operator already typed.
  await expect(typeSelect).not.toHaveValue("");

  await page.getByLabel("Observaciones (opcional)").fill("Ingreso E2E");
  await page.getByLabel("Deja la llave puesta").check();
  await page.getByLabel("Roturas o daños existentes (opcional)").fill("Rayón E2E");

  await page.getByRole("button", { name: "Confirmar ingreso" }).click();

  await expect(page.getByText("Ingreso registrado")).toBeVisible();
  await expect(page.getByText(new RegExp(plate)).first()).toBeVisible();

  await page.getByRole("button", { name: /Registrar otro ingreso/ }).click();
  await expect(page.getByLabel("Patente")).toHaveValue("");

  await page.goto("/operaciones/estadias");
  await expect(page.getByRole("cell", { name: plate })).toBeVisible();

  // The condition declared at entry survives to the charge screen.
  await page.goto("/operaciones/egreso");
  await page.locator("li a").filter({ hasText: plate }).first().click();
  await expect(page.getByText("Condición registrada al ingresar")).toBeVisible();
  await expect(page.getByText(/La llave quedó en el vehículo/)).toBeVisible();
  await expect(page.getByText(/Roturas:/)).toBeVisible();

  await payStay(page, plate);
});
