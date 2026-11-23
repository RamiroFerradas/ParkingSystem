import { test, expect } from "@playwright/test";

/**
 * User administration: create an employee, edit their per-user permissions,
 * rotate the password and toggle the account. The created account is throwaway
 * (`e2e-user-*`) and the dev fixtures purge it on the next run.
 */
const stamp = Date.now() % 100000;
const EMAIL = `e2e-user-${stamp}@parking.local`;
const NAME = `E2E Usuario ${stamp}`;

test("crea un usuario, edita accesos, cambia la clave y lo desactiva", async ({ page }) => {
  await page.goto("/administracion/usuarios");
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

  await page.getByPlaceholder("Email").fill(EMAIL);
  await page.getByPlaceholder("Nombre y apellido").fill(NAME);
  await page.getByPlaceholder("Contraseña (mín. 8)").fill("E2e-User-2026!");
  await page.getByRole("button", { name: "Crear usuario" }).click();

  const row = page.locator("tbody tr").filter({ hasText: EMAIL }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText("Activo")).toBeVisible();

  // Per-user permissions: an explicit exception over the role matrix.
  await row.getByRole("button", { name: "Accesos" }).click();
  const editor = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: `Accesos de ${NAME}` }) });
  await expect(editor).toBeVisible();
  await editor.locator("select").first().selectOption("deny");
  await editor.getByRole("button", { name: "Guardar accesos" }).click();
  await expect(editor.getByText("Accesos actualizados")).toBeVisible();
  await editor.getByRole("button", { name: "Cerrar" }).click();

  // Password rotation through the prompt dialog.
  await row.getByRole("button", { name: "Contraseña" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Cambiar contraseña" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Contraseña nueva").fill("E2e-User-2027!");
  await dialog.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(dialog).toHaveCount(0);

  // Deactivate and reactivate: a disabled account cannot log in.
  await row.getByRole("button", { name: "Desactivar" }).click();
  await expect(row.getByText("Inactivo")).toBeVisible();
  await row.getByRole("button", { name: "Reactivar" }).click();
  await expect(row.getByText("Activo")).toBeVisible();
});

test("la API de usuarios lista las cuentas y exige user.manage", async ({ page }) => {
  const users = await page.request.get("/api/users");
  expect(users.status()).toBe(200);
  const body = (await users.json()) as { users: { email: string }[] };
  expect(body.users.some((user) => user.email === EMAIL)).toBe(true);
});
