import { expect, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";

/** Persisted sessions written by `auth.setup.ts`. */
export const AUTH = {
  admin: "e2e/.auth/admin.json",
  employee: "e2e/.auth/employee.json",
  multibranch: "e2e/.auth/multibranch.json",
} as const;

/**
 * The dev target keeps its boxes apart from the real branch (`E2E-01`…), while
 * the disposable target seeds plain numbers (`01`…). The app's ingreso screen
 * lists every available box of every branch, so the journey must pick one that
 * belongs to the suite's own branch.
 */
export const BOX_PREFIX = process.env.E2E_TARGET === "dev" ? "E2E-" : "";

export function main(page: Page): Locator {
  // The shell renders the mobile and the desktop layout; only one is visible.
  return page.locator("main:visible").first();
}

export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByRole("status").filter({ hasText: text }).first();
}

/**
 * The plate that survives `normalizePlate` (A-Z0-9) and is unique per run, so a
 * journey never collides with a leftover stay.
 */
export function uniquePlate(prefix = "AA"): string {
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}${digits}`;
}

async function shiftStatus(page: Page): Promise<"open" | "closed"> {
  const response = await page.request.post("/api/shifts/open", { data: {} });
  // 400 = a shift is already open in this branch, which is a valid start state.
  expect([200, 400], `abrir turno respondió ${response.status()}`).toContain(response.status());
  return response.status() === 200 ? "open" : "open";
}

/** Leaves an open cash shift in the active branch (ingresos require one). */
export async function ensureOpenShift(page: Page) {
  const response = await page.request.post("/api/shifts/open", { data: {} });
  // 400 = a shift is already open in this branch, which is a valid start state.
  expect(
    [200, 400],
    `no se pudo asegurar un turno abierto (HTTP ${response.status()})`,
  ).toContain(response.status());
}

/** Closes the shift of the active branch, forcing it if stays are open. */
export async function closeShift(page: Page) {
  const response = await page.request.post("/api/shifts/close", { data: { force: true } });
  expect(
    [200, 400],
    `no se pudo cerrar el turno (HTTP ${response.status()})`,
  ).toContain(response.status());
}

/** Base URL the runner is using (mirrors `playwright.config.ts`). */
export function baseUrl() {
  return process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3300}`;
}

/** Runs a request batch as the admin, whatever role the test is using. */
export async function withAdminContext<T>(
  browser: Browser,
  run: (request: APIRequestContext) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ storageState: AUTH.admin, baseURL: baseUrl() });
  try {
    return await run(context.request);
  } finally {
    await context.close();
  }
}

/**
 * Force-closes the active branch's shift as an admin. The employee can only
 * close the shift they opened, so "no shift open" preconditions need an admin.
 */
export async function resetShiftAsAdmin(browser: Browser) {
  await withAdminContext(browser, async (request) => {
    const response = await request.post("/api/shifts/close", { data: { force: true } });
    expect([200, 400], `cerrar turno como admin (HTTP ${response.status()})`).toContain(
      response.status(),
    );
  });
}

/** First box offered by the ingreso picker that belongs to the suite's branch. */
export function boxOption(page: Page, index = 0): Locator {
  const options = page.locator("[data-box-option]");
  return BOX_PREFIX ? options.filter({ hasText: BOX_PREFIX }).nth(index) : options.nth(index);
}

/**
 * Registers an entry through the real form. Used as a precondition by the
 * egreso / move / historial journeys, which are the behaviour under test.
 */
export async function createStay(page: Page, plate: string, options: { type?: string } = {}) {
  await ensureOpenShift(page);
  await page.goto("/operaciones/ingreso");

  const plateInput = page.getByLabel("Patente");
  await plateInput.fill(plate);
  await plateInput.blur();
  await expect(page.getByText(/Vehículo nuevo/)).toBeVisible();

  const typeSelect = page.locator("#vehicleType");
  await typeSelect.selectOption({ label: options.type ?? "Auto" });
  await expect(typeSelect).not.toHaveValue("");

  const options_ = boxOption(page);
  await expect(options_, "tiene que haber un box libre en la sucursal E2E").toBeVisible();
  await options_.click();

  await page.getByRole("button", { name: "Confirmar ingreso" }).click();
  await expect(page.getByText("Ingreso registrado")).toBeVisible();
}

/** Charges and closes an open stay from the egreso screen. */
export async function payStay(page: Page, plate: string, method = "Efectivo") {
  await page.goto("/operaciones/egreso");

  const row = page.locator("li a").filter({ hasText: plate }).first();
  await expect(row, `la estadía ${plate} tiene que figurar en egresos`).toBeVisible();
  await row.click();

  await expect(page.getByText(`Ticket #`).first()).toBeVisible();
  // The payment radios are sr-only by design (the label is the visible target),
  // so the check bypasses actionability instead of clicking a hidden input.
  await page.getByRole("radio", { name: method }).check({ force: true });
  await page.getByRole("button", { name: /Confirmar (cobro|egreso)/ }).click();
  await expect(page.getByText("Cobro registrado")).toBeVisible();
}

/** Signs out through the user menu (role label is the trigger's name). */
export async function signOut(page: Page, roleLabel: "Administrador" | "Empleado") {
  await page.getByRole("button", { name: roleLabel }).click();
  await page.getByRole("menuitem", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/);
}
