import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SpecialsManager, type SpecialView } from "@/app/(app)/tarifas/especiales/specials-manager";
import { formatDate, formatTime } from "@/lib/format";

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

const SPECIALS: SpecialView[] = [
  {
    id: "sp1",
    name: "Feriado",
    starts_at: "2030-05-25T10:00:00.000Z",
    ends_at: "2030-05-26T10:00:00.000Z",
    vehicle_type_ids: [],
    adjustment_type: "percent",
    adjustment_value: "15",
    priority: 100,
    status: "scheduled",
  },
  {
    id: "sp2",
    name: "Evento",
    starts_at: "2030-06-01T10:00:00.000Z",
    ends_at: "2030-06-02T10:00:00.000Z",
    vehicle_type_ids: ["vt1"],
    adjustment_type: "fixed_amount",
    adjustment_value: "1250",
    priority: 50,
    status: "active",
  },
  {
    id: "sp3",
    name: "Viejo",
    starts_at: "2020-01-01T10:00:00.000Z",
    ends_at: "2020-01-02T10:00:00.000Z",
    vehicle_type_ids: [],
    adjustment_type: "percent",
    adjustment_value: "10",
    priority: 200,
    status: "expired",
  },
];

const VEHICLE_TYPES = [
  { id: "vt1", name: "Auto" },
  { id: "vt2", name: "Camioneta" },
];

interface Handler {
  (url: string, init: RequestInit | undefined): Response | Promise<Response>;
}

function mockFetch(handler: Handler) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
}

function rowOf(name: string) {
  return screen.getByText(name).closest("tr") as HTMLTableRowElement;
}

function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function fillPeriod(values: {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  value?: string;
  priority?: string;
}) {
  if (values.name !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Nombre (ej. Feriado)"), {
      target: { value: values.name },
    });
  }
  if (values.startsAt !== undefined) {
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: values.startsAt } });
  }
  if (values.endsAt !== undefined) {
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: values.endsAt } });
  }
  if (values.value !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("% (1-100)"), {
      target: { value: values.value },
    });
  }
  if (values.priority !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Prioridad (menor = mayor)"), {
      target: { value: values.priority },
    });
  }
}

describe("SpecialsManager", () => {
  it("renders each special period with its range, adjustment, priority and status", () => {
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    expect(screen.getByRole("heading", { name: "Tarifas especiales" })).toBeInTheDocument();

    const feriado = rowOf("Feriado");
    const range = `${formatDate(SPECIALS[0]!.starts_at)} ${formatTime(SPECIALS[0]!.starts_at)} → ${formatDate(
      SPECIALS[0]!.ends_at,
    )} ${formatTime(SPECIALS[0]!.ends_at)}`;
    expect(within(feriado).getByText(range)).toBeInTheDocument();
    expect(within(feriado).getByText("+15%")).toBeInTheDocument();
    expect(within(feriado).getByText("100")).toBeInTheDocument();
    expect(within(feriado).getByText("Programado")).toBeInTheDocument();

    expect(within(rowOf("Evento")).getByText("+12.50 ARS")).toBeInTheDocument();
    expect(within(rowOf("Evento")).getByText("Activo")).toBeInTheDocument();
    expect(within(rowOf("Viejo")).getByText("Finalizado")).toBeInTheDocument();
  });

  it("only allows cancelling scheduled or active periods", () => {
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    expect(within(rowOf("Feriado")).getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(within(rowOf("Evento")).getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(within(rowOf("Viejo")).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });

  it("keeps the create button disabled until the period is complete", () => {
    render(<SpecialsManager specials={[]} vehicleTypes={VEHICLE_TYPES} />);

    const create = screen.getByRole("button", { name: "Crear período" });
    expect(create).toBeDisabled();

    fillPeriod({ name: "Feriado", startsAt: "2030-05-25T10:00", endsAt: "2030-05-26T10:00" });
    expect(create).toBeDisabled();

    fillPeriod({ value: "15" });
    expect(create).toBeEnabled();
  });

  it("creates a percentage period with numeric values and reloads", async () => {
    mockFetch((url, init) => {
      if (init?.method === "POST") return jsonResponse({ special: { id: "sp9" } });
      return jsonResponse({ specials: SPECIALS });
    });
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    fillPeriod({
      name: "Feriado largo",
      startsAt: "2030-05-25T10:00",
      endsAt: "2030-05-26T10:00",
      value: "12,5",
      priority: "25",
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST")).toHaveLength(1),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/special-tariffs");
    expect(bodyOf(init)).toEqual({
      name: "Feriado largo",
      startsAt: "2030-05-25T10:00",
      endsAt: "2030-05-26T10:00",
      adjustmentType: "percent",
      priority: 25,
      vehicleTypeIds: [],
      adjustmentValue: 12.5,
    });
    expect((screen.getByPlaceholderText("Nombre (ej. Feriado)") as HTMLInputElement).value).toBe("");
  });

  it("converts a fixed amount to cents before sending it", async () => {
    mockFetch((url, init) => {
      if (init?.method === "POST") return jsonResponse({ special: { id: "sp9" } });
      return jsonResponse({ specials: [] });
    });
    render(<SpecialsManager specials={[]} vehicleTypes={VEHICLE_TYPES} />);

    fillPeriod({ name: "Evento", startsAt: "2030-06-01T10:00", endsAt: "2030-06-02T10:00" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fixed_amount" } });
    fireEvent.change(screen.getByPlaceholderText("Centavos"), { target: { value: "12,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(bodyOf(init)).toMatchObject({ adjustmentType: "fixed_amount", adjustmentValue: 1250 });
  });

  it("sends the checked vehicle types, and Todos resets the selection", async () => {
    mockFetch((url, init) => {
      if (init?.method === "POST") return jsonResponse({ special: { id: "sp9" } });
      return jsonResponse({ specials: [] });
    });
    render(<SpecialsManager specials={[]} vehicleTypes={VEHICLE_TYPES} />);

    fillPeriod({ name: "Sólo autos", startsAt: "2030-06-01T10:00", endsAt: "2030-06-02T10:00", value: "10" });

    const todos = screen.getByRole("checkbox", { name: "Todos" });
    expect(todos).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Auto" }));
    expect(todos).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf((fetchMock.mock.calls[0] as [string, RequestInit])[1])).toMatchObject({
      vehicleTypeIds: ["vt1"],
    });

    fetchMock.mockClear();
    fireEvent.click(todos);
    fillPeriod({ name: "Todos los tipos", startsAt: "2030-07-01T10:00", endsAt: "2030-07-02T10:00", value: "20" });
    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf((fetchMock.mock.calls[0] as [string, RequestInit])[1])).toMatchObject({
      vehicleTypeIds: [],
    });
  });

  it("strips non numeric characters from the priority field", () => {
    render(<SpecialsManager specials={[]} vehicleTypes={VEHICLE_TYPES} />);

    const priority = screen.getByPlaceholderText("Prioridad (menor = mayor)") as HTMLInputElement;
    fireEvent.change(priority, { target: { value: "1a0b0" } });

    expect(priority.value).toBe("100");
  });

  it("shows the server error when creation fails", async () => {
    mockFetch(() => jsonResponse({ error: "Se superpone con otro período" }, 409));
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    fillPeriod({ name: "Feriado", startsAt: "2030-05-25T10:00", endsAt: "2030-05-26T10:00", value: "15" });
    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));

    expect(await screen.findByText("Se superpone con otro período")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the HTTP status when the error body is empty", async () => {
    mockFetch(() => jsonResponse({}, 500));
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    fillPeriod({ name: "Feriado", startsAt: "2030-05-25T10:00", endsAt: "2030-05-26T10:00", value: "15" });
    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));

    expect(await screen.findByText("Error 500")).toBeInTheDocument();
  });

  it("reloads with a GET request that carries no body", async () => {
    const cancelled = SPECIALS.map((s) =>
      s.id === "sp1" ? { ...s, status: "cancelled" } : s,
    );
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ special: {} });
      return jsonResponse({ specials: cancelled });
    });
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("Feriado")).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const getInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(getInit.method).toBe("GET");
    expect(getInit.body).toBeUndefined();
  });

  it("rejects a period whose end is not after its start", async () => {
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    fillPeriod({
      name: "Al revés",
      startsAt: "2030-05-26T10:00",
      endsAt: "2030-05-25T10:00",
      value: "15",
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear período" }));

    expect(await screen.findByText("El fin debe ser posterior al inicio")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a scheduled period and reloads the list", async () => {
    const cancelled = SPECIALS.map((s) =>
      s.id === "sp1" ? { ...s, status: "cancelled" } : s,
    );
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ special: {} });
      return jsonResponse({ specials: cancelled });
    });
    render(<SpecialsManager specials={SPECIALS} vehicleTypes={VEHICLE_TYPES} />);

    fireEvent.click(within(rowOf("Feriado")).getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/special-tariffs");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ id: "sp1", status: "cancelled" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });
});
