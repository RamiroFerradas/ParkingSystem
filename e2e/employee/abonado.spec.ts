import { test, expect } from "@playwright/test";
import {
  AUTH,
  boxOption,
  ensureOpenShift,
  uniquePlate,
  withAdminContext,
} from "../support/app";

/**
 * A monthly subscriber: an admin creates the abono (that flow is admin-only
 * because it charges the shift), then the employee registers the entry and the
 * exit. The exit must not charge by the hour.
 */
function artDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(date);
}

test.use({ storageState: AUTH.employee });

test("un abonado vigente ingresa y egresa sin cobro por hora", async ({ page, browser }) => {
  const plate = uniquePlate("SB");

  // Precondition: an open shift (the abono is charged to it) and the abono itself.
  await ensureOpenShift(page);
  await withAdminContext(browser, async (request) => {
    const tariffs = (await (await request.get("/api/tariffs")).json()) as {
      tariffs: { id: string; kind: string; is_active: boolean }[];
    };
    const plan = tariffs.tariffs.find((tariff) => tariff.kind === "monthly" && tariff.is_active);
    expect(plan, "la sucursal E2E necesita un plan mensual activo").toBeTruthy();

    const methods = (await (await request.get("/api/payment-methods")).json()) as {
      methods: { id: string; name: string }[];
    };
    const method = methods.methods.find((item) => item.name === "Efectivo");
    expect(method).toBeTruthy();

    const created = await request.post("/api/subscriptions", {
      data: {
        plate,
        tariffId: plan!.id,
        methodId: method!.id,
        startsOn: artDate(-1),
        endsOn: artDate(30),
        notes: "Abono E2E",
      },
    });
    if (!created.ok()) throw new Error(`alta de abono falló: ${await created.text()}`);
  });

  // Entry: the plate lookup already knows the abono.
  await page.goto("/operaciones/ingreso");
  const plateInput = page.getByLabel("Patente");
  await plateInput.fill(plate);
  await plateInput.blur();
  await expect(page.getByText(/Abonado hasta/)).toBeVisible();

  // An existing vehicle/plan fixes the type; only ask for it when the form does.
  if (await page.locator("#vehicleType").isVisible()) {
    await page.locator("#vehicleType").selectOption({ label: "Auto" });
  }
  await boxOption(page).click();
  await page.getByRole("button", { name: "Confirmar ingreso" }).click();
  await expect(page.getByText("Ingreso registrado")).toBeVisible();

  // Exit: no hourly charge, the button says "Confirmar egreso".
  await page.goto("/operaciones/egreso");
  await page.locator("li a").filter({ hasText: plate }).first().click();
  await expect(page.getByText("Estadía abonada: no se cobra por hora.")).toBeVisible();
  await expect(page.getByText("Abonado", { exact: true }).first()).toBeVisible();

  await page.getByRole("radio", { name: "Efectivo" }).check({ force: true });
  await page.getByRole("button", { name: "Confirmar egreso" }).click();

  await expect(page.getByText("Cobro registrado")).toBeVisible();
  await expect(page.getByText(/Box liberado/)).toBeVisible();
});
