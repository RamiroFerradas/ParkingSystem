import { test, expect } from "@playwright/test";
import { BOX_PREFIX, main } from "../support/app";

/**
 * Admin box management: the map (edit a free box inline) and the structure
 * screen (create a floor with generated boxes, rename it, deactivate it).
 *
 * The mutations are asserted on a fresh navigation: the page's client refresh
 * can lag behind the PATCH/POST, and what matters is the persisted state.
 */
const TARGET_BOX = `${BOX_PREFIX}${BOX_PREFIX ? "06" : "04"}`;
const FLOOR_NAME = "Piso E2E";
// The new floor's boxes are `PE-01`/`PE-02` (prefix = initials of its name); the
// chips keep that text after the floor is renamed, so they anchor the section.
const FLOOR_BOX_CHIP = "PE-01";

function floorSection(page: import("@playwright/test").Page) {
  return page.locator("section").filter({ hasText: FLOOR_BOX_CHIP }).first();
}

test("el mapa de boxes busca, edita un box libre y persiste el cambio", async ({ page }) => {
  await page.goto("/boxes/mapa");
  await expect(page.getByRole("heading", { name: "Mapa de boxes" })).toBeVisible();
  await expect(page.getByText(/Libres: \d+/)).toBeVisible();

  const search = page.getByLabel("Buscar patente, ticket o box");
  await search.fill(TARGET_BOX);
  await expect(page.getByRole("status").filter({ hasText: /box encontrado/ })).toBeVisible();

  const tile = page.locator("[data-box-tile]").filter({ hasText: TARGET_BOX }).first();
  await expect(tile).toBeVisible();
  await tile.click();

  const panel = page.locator("[data-box-edit-panel]");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Editar box")).toBeVisible();

  const sector = page.locator("[data-box-edit-sector]");
  await expect(sector).toBeVisible();
  await sector.fill("Sector-E2E");
  await page.locator("[data-box-edit-save]").click();

  await expect(panel).toHaveCount(0);
  await expect(page.locator("[data-box-tile]").filter({ hasText: "Sector-E2E" })).toBeVisible();

  // Put it back so the dev branch keeps its original layout.
  await page.locator("[data-box-tile]").filter({ hasText: TARGET_BOX }).first().click();
  await page.locator("[data-box-edit-sector]").fill("E2E");
  await page.locator("[data-box-edit-save]").click();
  await expect(panel).toHaveCount(0);
});

test("estructura de boxes crea un piso con boxes, lo renombra y lo desactiva", async ({ page }) => {
  await page.goto("/boxes/administracion");
  await expect(page.getByRole("heading", { name: "Estructura de boxes" })).toBeVisible();

  const created = page.waitForResponse(
    (response) => response.url().includes("/api/floors") && response.request().method() === "POST",
  );
  await page.getByPlaceholder("Nombre del piso (ej. Planta baja)").fill(FLOOR_NAME);
  await page.getByPlaceholder("Cantidad de boxes").fill("2");
  await page.getByRole("button", { name: "Crear piso" }).click();
  expect((await created).ok()).toBe(true);

  await page.goto("/boxes/administracion");
  const section = floorSection(page);
  await expect(section).toBeVisible();
  await expect(section).toContainText("2 boxes");

  // Rename in place: the floor name moves into an input, so the section is
  // anchored by its generated boxes.
  await section.getByRole("button", { name: "Renombrar" }).click();
  await section.locator("input").first().fill(`${FLOOR_NAME} renombrado`);
  const renamed = page.waitForResponse(
    (response) => response.url().includes("/api/floors") && response.request().method() === "PATCH",
  );
  await section.getByRole("button", { name: "Guardar" }).click();
  expect((await renamed).ok()).toBe(true);

  await page.goto("/boxes/administracion");
  await expect(floorSection(page)).toContainText(`${FLOOR_NAME} renombrado`);

  // Add one more box to the floor.
  await floorSection(page).getByRole("button", { name: "+ Box" }).click();
  const boxNumber = `${BOX_PREFIX ? "PISO" : "PB2"}-${Date.now() % 1000}`;
  await floorSection(page).getByPlaceholder("Número (ej. PB-31)").fill(boxNumber);
  await floorSection(page).getByPlaceholder("Sector (opcional)").fill("E2E");
  const boxCreated = page.waitForResponse(
    (response) => response.url().includes("/api/boxes") && response.request().method() === "POST",
  );
  await floorSection(page).getByRole("button", { name: "Agregar" }).click();
  expect((await boxCreated).ok()).toBe(true);

  await page.goto("/boxes/administracion");
  await expect(floorSection(page)).toContainText(boxNumber);

  // Deactivate it: the floor leaves the map but the history stays.
  const deactivated = page.waitForResponse(
    (response) => response.url().includes("/api/floors") && response.request().method() === "PATCH",
  );
  await floorSection(page).getByRole("button", { name: "Desactivar piso" }).click();
  expect((await deactivated).ok()).toBe(true);

  await page.goto("/boxes/administracion");
  await expect(floorSection(page).getByRole("button", { name: "Reactivar piso" })).toBeVisible();

  await page.goto("/boxes/mapa");
  await expect(main(page).getByText(`${FLOOR_NAME} renombrado`)).toHaveCount(0);
});
