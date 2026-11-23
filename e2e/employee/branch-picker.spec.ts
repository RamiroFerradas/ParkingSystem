import { test, expect } from "@playwright/test";
import { AUTH } from "../support/app";

/**
 * A user with two memberships cannot be auto-selected by login, so the app
 * sends them to the branch picker. Choosing a branch re-issues the session
 * cookie with that branch, and the header pill lets them switch again.
 */
test.use({ storageState: AUTH.multibranch });

/** First line of each branch button: the branch name. */
async function branchNames(page: import("@playwright/test").Page) {
  const buttons = page.getByRole("button", { name: /Entrar/ });
  const count = await buttons.count();
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    names.push((await buttons.nth(index).innerText()).split("\n")[0]!.trim());
  }
  return { buttons, names };
}

test("elige sucursal al entrar y puede cambiarla desde el header", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/seleccionar-sucursal/);
  await expect(page.getByRole("heading", { name: "Elegí una sucursal" })).toBeVisible();
  await expect(page.getByText(/Todo lo que hagas a partir de acá queda en la sucursal/)).toBeVisible();

  const { buttons, names } = await branchNames(page);
  expect(names.length, "el usuario multibranch necesita dos sucursales").toBeGreaterThan(1);
  const [first, second] = names as [string, string];

  await buttons.first().click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: first })).toBeVisible();

  // The pill opens the branch menu; picking the other branch re-issues the
  // cookie and the header reflects the change.
  await page.getByRole("button", { name: first }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: new RegExp(second) }).click();

  await expect(page.getByRole("button", { name: second })).toBeVisible();
  await expect(page.getByRole("button", { name: first })).toHaveCount(0);
});
