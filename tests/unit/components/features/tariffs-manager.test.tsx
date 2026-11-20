import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TariffsManager, type TariffView } from "@/app/(app)/tarifas/productos/tariffs-manager";

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface Handler {
  (url: string, init: RequestInit | undefined): Response | Promise<Response>;
}

function mockFetch(handler: Handler) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
}

const VEHICLE_TYPES = [
  { id: "vt1", name: "Auto" },
  { id: "vt2", name: "Camioneta" },
];

function tariff(partial: Partial<TariffView> & Pick<TariffView, "id" | "name">): TariffView {
  return {
    kind: "hourly",
    code: null,
    vehicle_type_id: "vt1",
    vehicle_type_name: "Auto",
    duration_minutes: 60,
    duration_mode: "fixed",
    amount_cents: "600000",
    is_active: true,
    valid_from: "2024-01-01T00:00:00.000Z",
    valid_to: null,
    valid_from_local: "2024-01-01T00:00",
    valid_to_local: null,
    ...partial,
  };
}

const HOURLY_FIXED = tariff({ id: "t1", name: "1 hora", duration_minutes: 60, amount_cents: "600000" });
const HOURLY_TEMP = tariff({
  id: "t2",
  name: "90 minutos",
  duration_minutes: 90,
  amount_cents: "900000",
  valid_from: "2020-01-01T00:00:00.000Z",
  valid_to: "2099-01-01T00:00:00.000Z",
  valid_from_local: "2020-01-01T00:00",
  valid_to_local: "2099-01-01T00:00",
});
const HOURLY_EXPIRED = tariff({
  id: "t3",
  name: "2 horas",
  duration_minutes: 120,
  amount_cents: "1200000",
  valid_from: "2019-01-01T00:00:00.000Z",
  valid_to: "2020-01-01T00:00:00.000Z",
  valid_from_local: "2019-01-01T00:00",
  valid_to_local: "2020-01-01T00:00",
});
const MONTHLY = tariff({
  id: "t4",
  name: "Abono mensual",
  kind: "monthly",
  duration_minutes: null,
  amount_cents: "1500000",
});
const OTHER_TYPE = tariff({
  id: "t5",
  name: "1 hora camioneta",
  vehicle_type_id: "vt2",
  vehicle_type_name: "Camioneta",
  amount_cents: "900000",
});

const ALL = [HOURLY_FIXED, HOURLY_TEMP, HOURLY_EXPIRED, MONTHLY, OTHER_TYPE];

function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function rowOf(label: string) {
  return screen.getByText(label).closest("tr") as HTMLTableRowElement;
}

function monthlySection() {
  const heading = screen.getByRole("heading", { name: "Abono mensual" });
  return heading.closest("div")!.parentElement as HTMLElement;
}

describe("TariffsManager", () => {
  it("lists the vehicle types with their hourly block count and marks the active one", () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    expect(screen.getByRole("heading", { name: "Tarifas por vehículo" })).toBeInTheDocument();

    const auto = screen.getByRole("button", { name: /Auto/ });
    const camioneta = screen.getByRole("button", { name: /Camioneta/ });
    expect(auto).toHaveAttribute("aria-pressed", "true");
    expect(camioneta).toHaveAttribute("aria-pressed", "false");
    expect(auto).toHaveTextContent("3");
    expect(camioneta).toHaveTextContent("1");
  });

  it("switches the card when another vehicle type is chosen", () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    expect(screen.getByRole("heading", { name: "Auto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Camioneta/ }));

    expect(screen.getByRole("heading", { name: "Camioneta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Camioneta/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the block duration, amount, validity and active state", () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    expect(within(rowOf("1 h")).getByText(/6\.000,00/)).toBeInTheDocument();
    expect(within(rowOf("1 h")).getByText("Fija")).toBeInTheDocument();
    expect(within(rowOf("1 h")).getByText("Activo")).toBeInTheDocument();

    expect(within(rowOf("90 min")).getByText("Temporal")).toBeInTheDocument();
    expect(within(rowOf("2 h")).getByText("Vencida")).toBeInTheDocument();
    expect(within(rowOf("2 h")).getByText("2019-01-01 00:00 → 2020-01-01 00:00")).toBeInTheDocument();
  });

  it("shows empty states for both blocks and monthly plans", () => {
    render(<TariffsManager tariffs={[]} vehicleTypes={[{ id: "vt1", name: "Auto" }]} />);

    expect(screen.getByText("Sin bloques cargados: agregá el primero abajo.")).toBeInTheDocument();
    expect(
      screen.getByText("Sin abonos cargados para este tipo de vehículo."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 bloques")).toBeInTheDocument();
    expect(screen.getByText("0 planes")).toBeInTheDocument();
  });

  it("adds an hourly block converting hours and pesos to minutes and cents", async () => {
    mockFetch((url, init) => {
      if (init?.method === "POST") return jsonResponse({ tariff: { id: "t9" } });
      return jsonResponse({ tariffs: ALL });
    });
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.change(screen.getAllByLabelText("Horas")[0]!, { target: { value: "1.5" } });
    fireEvent.change(screen.getAllByLabelText("Monto ARS")[0]!, { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar bloque" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST")).toHaveLength(1),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tariffs");
    expect(bodyOf(init)).toEqual({
      vehicleTypeId: "vt1",
      durationMinutes: 90,
      amountCents: 150000,
    });
    expect((screen.getAllByLabelText("Horas")[0] as HTMLInputElement).value).toBe("");
    expect((screen.getAllByLabelText("Monto ARS")[0] as HTMLInputElement).value).toBe("");
  });

  it("rejects a zero duration without calling the API", async () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.change(screen.getAllByLabelText("Horas")[0]!, { target: { value: "0" } });
    fireEvent.change(screen.getAllByLabelText("Monto ARS")[0]!, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar bloque" }));

    expect(await screen.findByText("Horas inválidas")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Córdoba local validity as ISO for a temporary block", async () => {
    mockFetch((url, init) => {
      if (init?.method === "POST") return jsonResponse({ tariff: { id: "t9" } });
      return jsonResponse({ tariffs: ALL });
    });
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.change(screen.getAllByLabelText("Horas")[0]!, { target: { value: "2" } });
    fireEvent.change(screen.getAllByLabelText("Monto ARS")[0]!, { target: { value: "999" } });
    fireEvent.change(screen.getAllByLabelText("Vigencia")[0]!, { target: { value: "temp" } });
    fireEvent.change(screen.getAllByLabelText("Desde")[0]!, {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.change(screen.getAllByLabelText("Hasta")[0]!, {
      target: { value: "2030-01-02T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar bloque" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf((fetchMock.mock.calls[0] as [string, RequestInit])[1])).toEqual({
      vehicleTypeId: "vt1",
      durationMinutes: 120,
      amountCents: 99900,
      validFrom: new Date("2030-01-01T10:00:00-03:00").toISOString(),
      validTo: new Date("2030-01-02T10:00:00-03:00").toISOString(),
    });
  });

  it("rejects a temporary block whose end is not after its start", async () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.change(screen.getAllByLabelText("Horas")[0]!, { target: { value: "2" } });
    fireEvent.change(screen.getAllByLabelText("Monto ARS")[0]!, { target: { value: "999" } });
    fireEvent.change(screen.getAllByLabelText("Vigencia")[0]!, { target: { value: "temp" } });
    fireEvent.change(screen.getAllByLabelText("Desde")[0]!, {
      target: { value: "2030-01-02T10:00" },
    });
    fireEvent.change(screen.getAllByLabelText("Hasta")[0]!, {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar bloque" }));

    expect(
      await screen.findByText("La vigencia debe terminar después de empezar"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds a monthly plan with kind monthly", async () => {
    mockFetch((url, init) => {
      if (init?.method === "POST") return jsonResponse({ tariff: { id: "t9" } });
      return jsonResponse({ tariffs: ALL });
    });
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    const section = monthlySection();
    fireEvent.change(within(section).getByLabelText("Monto ARS"), {
      target: { value: "1800.50" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Agregar abono" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf((fetchMock.mock.calls[0] as [string, RequestInit])[1])).toEqual({
      vehicleTypeId: "vt1",
      kind: "monthly",
      amountCents: 180050,
    });
  });

  it("edits the amount of a block with a PATCH and reloads", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ tariff: {} });
      return jsonResponse({ tariffs: ALL });
    });
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    const row = rowOf("1 h");
    fireEvent.click(within(row).getByRole("button", { name: "Monto" }));

    const input = within(rowOf("1 h")).getByDisplayValue("6000.00");
    fireEvent.change(input, { target: { value: "7000" } });
    fireEvent.click(within(rowOf("1 h")).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "PATCH")).toHaveLength(1),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tariffs");
    expect(bodyOf(init)).toEqual({ id: "t1", amountCents: 700000 });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("cancels the amount edition restoring the stored value", () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("1 h")).getByRole("button", { name: "Monto" }));
    fireEvent.change(within(rowOf("1 h")).getByDisplayValue("6000.00"), {
      target: { value: "7777" },
    });
    fireEvent.click(within(rowOf("1 h")).getByRole("button", { name: "Cancelar" }));

    expect(within(rowOf("1 h")).getByText(/6\.000,00/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles a block between active and inactive", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ tariff: {} });
      return jsonResponse({ tariffs: ALL });
    });
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("1 h")).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tariffs");
    expect(bodyOf(init)).toEqual({ id: "t1", isActive: false });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("requires both dates before saving a temporary validity", async () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("1 h")).getByRole("button", { name: "Vigencia" }));
    const editor = screen.getByRole("button", { name: "Guardar vigencia" }).closest("tr") as HTMLElement;
    fireEvent.change(within(editor).getByLabelText("Vigencia"), { target: { value: "temp" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Guardar vigencia" }));

    expect(await screen.findByText("Completá desde y hasta")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes the expiry when a temporary block is set back to fixed", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ tariff: {} });
      return jsonResponse({ tariffs: ALL });
    });
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("90 min")).getByRole("button", { name: "Vigencia" }));
    const editor = screen.getByRole("button", { name: "Guardar vigencia" }).closest("tr") as HTMLElement;
    fireEvent.change(within(editor).getByLabelText("Vigencia"), { target: { value: "fixed" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Guardar vigencia" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const payload = bodyOf((fetchMock.mock.calls[0] as [string, RequestInit])[1]);
    expect(payload.id).toBe("t2");
    expect(payload.validTo).toBeNull();
    expect(typeof payload.validFrom).toBe("string");
    expect(Number.isNaN(Date.parse(String(payload.validFrom)))).toBe(false);
  });

  it("rejects a negative amount before calling the API", async () => {
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.change(screen.getAllByLabelText("Horas")[0]!, { target: { value: "1" } });
    fireEvent.change(screen.getAllByLabelText("Monto ARS")[0]!, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar bloque" }));

    expect(await screen.findByText("Monto inválido")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server error when the API rejects the change", async () => {
    mockFetch(() => jsonResponse({ error: "No autorizado" }, 403));
    render(<TariffsManager tariffs={ALL} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("1 h")).getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByText("No autorizado")).toBeInTheDocument();
  });
});
