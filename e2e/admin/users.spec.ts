import { test, expect, request, type Browser, type Page } from "@playwright/test";
import { baseUrl } from "../support/app";

/**
 * User administration, end to end: create an employee, prove that the role
 * decides the menu, then grant one section and revoke another for that person
 * only and prove the effect in their own session. Finishes with the password
 * rotation, the disabled account and the cleanup.
 */
const stamp = Date.now() % 100000;
const EMAIL = `e2e-user-${stamp}@parking.local`;
const NAME = `E2E Usuario ${stamp}`;
const PASSWORD = "E2e-User-2026!";
const NEW_PASSWORD = "E2e-User-2027!";

const SIDEBAR = 'nav[aria-label="Menú principal"]';

// This flow opens three sessions (admin + the new user twice) and rotates the
// password: it legitimately needs more than the default 60s.
test.setTimeout(180_000);

function accessEditor(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: `Accesos de ${NAME}` }) });
}

function permissionRow(page: Page, label: string) {
  return accessEditor(page).locator("li").filter({ hasText: label }).first();
}

async function signInAsNewUser(browser: Browser, password = PASSWORD) {
  // A fresh context inherits the project's stored session; the point here is to
  // sign in as the new user, so it must start anonymous.
  const context = await browser.newContext({
    baseURL: baseUrl(),
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page, "el usuario nuevo tiene que entrar al dashboard").toHaveURL(/\/$|\/\?/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  return { context, page };
}

test("crea un usuario y le agrega y le saca secciones del menú", async ({ page, browser }) => {
  await page.goto("/administracion/usuarios");
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

  await page.getByPlaceholder("Email").fill(EMAIL);
  await page.getByPlaceholder("Nombre y apellido").fill(NAME);
  await page.getByPlaceholder("Contraseña (mín. 8)").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear usuario" }).click();

  const row = page.locator("tbody tr").filter({ hasText: EMAIL }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText("Activo")).toBeVisible();

  // 1) Without exceptions the role decides: an employee has no reports.
  {
    const { context, page: userPage } = await signInAsNewUser(browser);
    try {
      await expect(userPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      const nav = userPage.locator(SIDEBAR);
      await expect(nav.getByRole("link", { name: "Reportes" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Registrar ingreso" })).toBeVisible();
    } finally {
      await context.close();
    }
  }

  // 2) Grant `reports.read` and revoke `session.open` for this person only.
  await row.getByRole("button", { name: "Accesos" }).click();
  await expect(accessEditor(page)).toBeVisible();
  await permissionRow(page, "Reportes").locator("select").selectOption("allow");
  await permissionRow(page, "Registrar ingreso").locator("select").selectOption("deny");
  await accessEditor(page).getByRole("button", { name: "Guardar accesos" }).click();
  await expect(accessEditor(page).getByText("Accesos actualizados")).toBeVisible();
  await accessEditor(page).getByRole("button", { name: "Cerrar" }).click();

  // 3) The exceptions show up in that user's own menu and pages.
  {
    const { context, page: userPage } = await signInAsNewUser(browser);
    try {
      const nav = userPage.locator(SIDEBAR);
      await expect(nav.getByRole("link", { name: "Reportes" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Registrar ingreso" })).toHaveCount(0);

      await userPage.goto("/reportes");
      await expect(userPage.getByRole("heading", { name: "Reportes" })).toBeVisible();

      await userPage.goto("/operaciones/ingreso");
      await expect(userPage.getByText("Acceso restringido")).toBeVisible();
    } finally {
      await context.close();
    }
  }

  // 4) Password rotation.
  await row.getByRole("button", { name: "Contraseña" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Cambiar contraseña" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Contraseña nueva").fill(NEW_PASSWORD);
  await dialog.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(dialog).toHaveCount(0);

  const api = await request.newContext({ baseURL: baseUrl() });
  try {
    const withNew = await api.post("/api/auth/login", {
      data: { email: EMAIL, password: NEW_PASSWORD },
    });
    expect(withNew.status()).toBe(200);
    const withOld = await api.post("/api/auth/login", {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect([400, 401]).toContain(withOld.status());
  } finally {
    await api.dispose();
  }

  // 5) Deactivate: the account stops signing in, and the menu exceptions go
  //    back to "inherited" so the next run starts clean.
  await row.getByRole("button", { name: "Accesos" }).click();
  await permissionRow(page, "Reportes").locator("select").selectOption("inherit");
  await permissionRow(page, "Registrar ingreso").locator("select").selectOption("inherit");
  await accessEditor(page).getByRole("button", { name: "Guardar accesos" }).click();
  await expect(accessEditor(page).getByText("Accesos actualizados")).toBeVisible();
  await accessEditor(page).getByRole("button", { name: "Cerrar" }).click();

  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByText("Inactivo")).toBeVisible();

  const afterDeactivate = await request.newContext({ baseURL: baseUrl() });
  try {
    const denied = await afterDeactivate.post("/api/auth/login", {
      data: { email: EMAIL, password: NEW_PASSWORD },
    });
    expect([400, 401]).toContain(denied.status());
  } finally {
    await afterDeactivate.dispose();
  }
});
