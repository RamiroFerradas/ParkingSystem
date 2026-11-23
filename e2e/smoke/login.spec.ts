import { test, expect } from "@playwright/test";
import { signOut } from "../support/app";

/**
 * The login form itself: wrong credentials, the successful sign-in that lands
 * on the dashboard, and the logout from the user menu. Every other spec starts
 * from a persisted session, so this is the only place the form is exercised.
 */
const EMPLOYEE = { email: "e2e-employee@parking.local", password: "e2e-Employee-2026!" };

test.use({ storageState: { cookies: [], origins: [] } });

test("credenciales inválidas muestran el error y no dejan entrar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMPLOYEE.email);
  await page.getByLabel("Contraseña").fill("clave-incorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page.getByRole("alert")).toContainText("Credenciales inválidas");
  await expect(page).toHaveURL(/\/login/);
});

test("un empleado inicia sesión y puede salir desde el menú", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMPLOYEE.email);
  await page.getByLabel("Contraseña").fill(EMPLOYEE.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await expect(page).toHaveURL(/\/$|\/\?/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await signOut(page, "Empleado");

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
