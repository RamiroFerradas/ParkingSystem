import { test, expect } from "@playwright/test";
import { AUTH } from "../support/app";

/**
 * Menu-level permissions are decided on the server and only observable in the
 * browser. An employee has the operational permissions (`session.*`,
 * `box.read`, `shift.manage`) but not the administrative ones, so restricted
 * sections must not appear in the sidebar AND must answer with the restriction
 * when opened by URL.
 */
test.use({ storageState: AUTH.employee });

const SIDEBAR = 'nav[aria-label="Menú principal"]';

const ALLOWED = [
  "Dashboard",
  "Registrar ingreso",
  "Registrar egreso",
  "Estadías activas",
  "Historial",
  "Mapa de boxes",
  "Turnos de caja",
];

const HIDDEN = [
  "Estructura",
  "Listado",
  "Tipos de vehículos",
  "Productos tarifarios",
  "Tarifas especiales",
  "Abonados mensuales",
  "Reportes",
  "Ranking de boxes",
  "Reporte de turnos",
  "Impacto de abonos",
  "Sucursales",
  "Usuarios",
  "Medios de pago",
  "Sincronización",
  "Auditoría",
];

const BLOCKED_PAGES: { path: string; text: string | RegExp }[] = [
  { path: "/administracion/usuarios", text: "Acceso restringido" },
  { path: "/administracion/auditoria", text: /Solo el administrador puede consultar la auditoría/ },
  { path: "/administracion/sincronizacion", text: /Solo el administrador puede ver el estado de sincronización/ },
  { path: "/administracion/medios-de-pago", text: /Solo el administrador puede gestionar los medios de pago/ },
  { path: "/boxes/administracion", text: /Solo el administrador puede modificar la estructura/ },
  { path: "/vehiculos", text: /Solo el administrador y supervisores pueden ver el listado/ },
  { path: "/vehiculos/tipos", text: /Solo el administrador puede gestionar los tipos de vehículos/ },
  { path: "/tarifas/productos", text: /Solo el administrador puede gestionar el tarifario/ },
  { path: "/tarifas/especiales", text: /Solo el administrador puede gestionar tarifas especiales/ },
  { path: "/tarifas/abonados", text: /Solo el administrador puede gestionar abonos/ },
  { path: "/reportes", text: /Requiere permiso de reportes/ },
];

test("el empleado ve solo las secciones de operación en el menú", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator(SIDEBAR);

  for (const label of ALLOWED) {
    await expect(nav.getByRole("link", { name: label }), `falta ${label}`).toBeVisible();
  }
  for (const label of HIDDEN) {
    await expect(nav.getByRole("link", { name: label }), `no debería ver ${label}`).toHaveCount(0);
  }
});

test("el empleado conserva acceso a las pantallas operativas", async ({ page }) => {
  for (const path of [
    "/operaciones/ingreso",
    "/operaciones/egreso",
    "/operaciones/estadias",
    "/operaciones/historial",
    "/boxes/mapa",
    "/administracion/turnos",
  ]) {
    await page.goto(path);
    await expect(page.getByText("Acceso restringido"), `${path} no debería estar restringida`).toHaveCount(0);
    await expect(page.locator("main:visible").first()).toBeVisible();
  }
});

for (const blocked of BLOCKED_PAGES) {
  test(`el empleado no entra a ${blocked.path}`, async ({ page }) => {
    await page.goto(blocked.path);
    await expect(page.getByText(blocked.text)).toBeVisible();
  });
}

test("las sucursales son solo del master: el empleado vuelve al dashboard", async ({ page }) => {
  await page.goto("/sucursales");
  await expect(page).not.toHaveURL(/\/sucursales/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("la API también niega los permisos de administración", async ({ page }) => {
  const users = await page.request.get("/api/users");
  expect(users.status()).toBe(403);

  const tariffs = await page.request.post("/api/tariffs", {
    data: { vehicleTypeId: crypto.randomUUID(), durationMinutes: 60, amountCents: 1000 },
  });
  expect(tariffs.status()).toBe(403);

  const audit = await page.request.get("/api/audit-logs");
  expect(audit.status()).toBe(403);
});
