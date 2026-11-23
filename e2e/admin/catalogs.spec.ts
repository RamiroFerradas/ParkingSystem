import { test, expect } from "@playwright/test";

/**
 * Catalog CRUD: vehicle types (inline rename, deactivate) and payment methods
 * (create/reuse, rename through the dialog, deactivate). Both are idempotent so
 * they can run repeatedly against the shared dev schema.
 */
const TYPE_NAME = "Camioneta E2E";
const METHOD_CODE = "E2EX";
const METHOD_NAME = "E2E Extra";

type TypeRow = { id: string; name: string; is_active: boolean };
type MethodRow = { id: string; code: string; name: string; is_active: boolean };

async function typeIndex(page: import("@playwright/test").Page) {
  const response = await page.request.get("/api/vehicle-types");
  expect(response.status()).toBe(200);
  const { types } = (await response.json()) as { types: TypeRow[] };
  // Match by prefix: a previous run may have left the renamed variant behind.
  return types.findIndex((type) => type.name.startsWith(TYPE_NAME));
}

test("tipos de vehículos: crea o reactiva, renombra inline y desactiva", async ({ page }) => {
  await page.goto("/vehiculos/tipos");
  await expect(page.getByRole("heading", { name: "Tipos de vehículos" })).toBeVisible();

  let index = await typeIndex(page);
  const rows = page.locator("tbody tr");

  if (index === -1) {
    const before = await rows.count();
    await page.getByPlaceholder("Nombre (ej: Camioneta)").fill(TYPE_NAME);
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(rows).toHaveCount(before + 1);
    index = before;
  }

  const row = rows.nth(index);
  const input = row.locator("input").first();
  await expect(input).toHaveValue(new RegExp(`^${TYPE_NAME}`));

  // Inline rename saves on blur.
  await input.fill(`${TYPE_NAME} renombrada`);
  await input.blur();
  await expect(input).toHaveValue(`${TYPE_NAME} renombrada`);

  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByRole("button", { name: "Reactivar" })).toBeVisible();

  // Dejar el tipo activo otra vez para que el catálogo quede como estaba.
  await row.getByRole("button", { name: "Reactivar" }).click();
  await expect(row.getByRole("button", { name: "Desactivar" })).toBeVisible();

  // Restore the canonical name through the API: the inline editor saves on blur,
  // and a live refresh can race that save, so the cleanup must not depend on it.
  const list = await page.request.get("/api/vehicle-types");
  const { types } = (await list.json()) as { types: TypeRow[] };
  const mine = types.find((type) => type.name.startsWith(TYPE_NAME));
  if (mine && mine.name !== TYPE_NAME) {
    const patched = await page.request.patch("/api/vehicle-types", {
      data: { id: mine.id, name: TYPE_NAME },
    });
    expect(patched.ok()).toBe(true);
  }
});

test("medios de pago: crea o reutiliza, renombra y desactiva", async ({ page }) => {
  await page.goto("/administracion/medios-de-pago");
  await expect(page.getByRole("heading", { name: "Medios de pago" })).toBeVisible();

  const listResponse = await page.request.get("/api/payment-methods");
  expect(listResponse.status()).toBe(200);
  const { methods } = (await listResponse.json()) as { methods: MethodRow[] };
  const existing = methods.find((method) => method.code === METHOD_CODE);

  if (existing) {
    const row = page.locator("tbody tr").filter({ hasText: METHOD_CODE }).first();
    if (!existing.is_active) {
      await row.getByRole("button", { name: "Activar" }).click();
    }
  } else {
    await page.getByPlaceholder("Código (ej. EFE)").fill(METHOD_CODE);
    await page.getByPlaceholder("Nombre (ej. Efectivo)").fill(METHOD_NAME);
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(page.getByText(METHOD_CODE, { exact: true }).first()).toBeVisible();
  }

  const row = page.locator("tbody tr").filter({ hasText: METHOD_CODE }).first();
  await expect(row).toBeVisible();

  // Rename through the prompt dialog.
  await row.getByRole("button", { name: "Renombrar" }).click();
  await page.getByLabel("Nombre").fill(METHOD_NAME);
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(row.getByText(METHOD_NAME)).toBeVisible();

  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByRole("button", { name: "Activar" })).toBeVisible();
  await row.getByRole("button", { name: "Activar" }).click();
  await expect(row.getByRole("button", { name: "Desactivar" })).toBeVisible();
});
