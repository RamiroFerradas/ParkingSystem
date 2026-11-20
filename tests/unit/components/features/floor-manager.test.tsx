import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import {
  FloorManager,
  type AdminFloor,
} from "@/app/(app)/boxes/administracion/FloorManager";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function makeFloor(overrides: Partial<AdminFloor> = {}): AdminFloor {
  return {
    id: "floor-1",
    name: "Planta baja",
    sort_order: 10,
    is_active: true,
    boxes: [
      {
        id: "box-1",
        number: "PB-01",
        sector: "Frente",
        is_active: true,
        is_service_enabled: true,
        status: "available",
        plate: null,
      },
      {
        id: "box-2",
        number: "PB-02",
        sector: null,
        is_active: true,
        is_service_enabled: true,
        status: "occupied",
        plate: "AB123CD",
      },
      {
        id: "box-3",
        number: "PB-03",
        sector: null,
        is_active: false,
        is_service_enabled: false,
        status: "out_of_service",
        plate: null,
      },
    ],
    ...overrides,
  };
}

const FLOORS = [makeFloor(), makeFloor({ id: "floor-2", name: "Piso 1", sort_order: 20 })];

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as unknown as Response;
}

function section(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const found = heading.closest("section");
  if (!found) throw new Error(`section ${name} not found`);
  return found;
}

function createFloorForm() {
  const form = document.querySelector("form");
  if (!form) throw new Error("create floor form not rendered");
  return form;
}

function renderManager(floors: AdminFloor[] = FLOORS) {
  return render(<FloorManager floors={floors} />);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refreshMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FloorManager", () => {
  it("renders each floor with its box count and box chips", () => {
    renderManager();

    expect(screen.getByRole("heading", { name: "Planta baja" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Piso 1" })).toBeInTheDocument();
    expect(within(section("Planta baja")).getByText("3 boxes")).toBeInTheDocument();

    const pb1 = screen.getAllByTitle("Editar en el mapa")[0];
    expect(pb1).toHaveAttribute("href", "/boxes/mapa?box=box-1");
    expect(pb1).toHaveTextContent("PB-01");
    expect(pb1).toHaveTextContent("· Frente");
    expect(screen.getAllByText("AB123CD")).toHaveLength(2);
    expect(screen.getAllByText("baja")).toHaveLength(2);
  });

  it("shows the placeholder prefix until a floor name is typed", () => {
    renderManager([]);

    expect(screen.getByText("PREFIX-01")).toBeInTheDocument();
    expect(screen.getByText("PREFIX-02")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)"), {
      target: { value: "Planta alta" },
    });

    expect(screen.getByText("PA-01")).toBeInTheDocument();
    expect(screen.getByText("PA-02")).toBeInTheDocument();
    expect(screen.queryByText("PREFIX-01")).toBeNull();
  });

  it("falls back to the placeholder prefix when the initials are too long", () => {
    renderManager([]);

    fireEvent.change(screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)"), {
      target: { value: "uno dos tres cuatro cinco seis siete ocho nueve" },
    });

    expect(screen.getByText("PREFIX-01")).toBeInTheDocument();
  });

  it("creates a floor with the next sort order and clears the form", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager();

    fireEvent.change(screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)"), {
      target: { value: "Planta alta" },
    });
    fireEvent.change(screen.getByPlaceholderText("Cantidad de boxes"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear piso" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/floors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Planta alta",
        boxCount: 5,
        prefix: "PA",
        sortOrder: 30,
      }),
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)")).toHaveValue(""),
    );
    expect(screen.getByPlaceholderText("Cantidad de boxes")).toHaveValue(null);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("sends zero boxes when the count is not a number", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager([]);

    fireEvent.change(screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)"), {
      target: { value: "Sótano" },
    });
    fireEvent.submit(createFloorForm());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ name: "Sótano", boxCount: 0, prefix: "S", sortOrder: 10 }),
    });
  });

  // FIXED (FloorManager.tsx:122-124): this test used to assert the bug — the create form
  // cleared name and count after onSubmit resolved, even when the POST failed, so a 409 wiped
  // what the operator had typed. The form now clears only on success.
  it("keeps the typed values when the create failed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Ya existe un piso con ese nombre" }, false, 409),
    );
    renderManager([]);

    const nameInput = screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)");
    fireEvent.change(nameInput, { target: { value: "Planta alta" } });
    fireEvent.change(screen.getByPlaceholderText("Cantidad de boxes"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear piso" }));

    expect(
      await screen.findByText("Ya existe un piso con ese nombre"),
    ).toBeInTheDocument();
    expect(nameInput).toHaveValue("Planta alta");
    expect(screen.getByPlaceholderText("Cantidad de boxes")).toHaveValue(4);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps the create button disabled without a floor name", () => {    renderManager([]);

    expect(screen.getByRole("button", { name: "Crear piso" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Nombre del piso (ej. Planta baja)"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "Crear piso" })).toBeDisabled();
  });

  it("only allows moving the first floor down and the last floor up", () => {
    renderManager();

    expect(within(section("Planta baja")).getByTitle("Mover arriba")).toBeDisabled();
    expect(within(section("Planta baja")).getByTitle("Mover abajo")).toBeEnabled();
    expect(within(section("Piso 1")).getByTitle("Mover arriba")).toBeEnabled();
    expect(within(section("Piso 1")).getByTitle("Mover abajo")).toBeDisabled();
  });

  it("PATCHes the new sort order when moving a floor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByTitle("Mover abajo"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/floors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "floor-1", sortOrder: 11 }),
    });
  });

  it("renames a floor and closes the inline editor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager();

    const card = section("Planta baja");
    fireEvent.click(within(card).getByRole("button", { name: "Renombrar" }));

    const input = within(card).getByDisplayValue("Planta baja");
    fireEvent.change(input, { target: { value: "  Planta baja nueva " } });
    fireEvent.click(within(card).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/floors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "floor-1", name: "Planta baja nueva" }),
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Planta baja" })).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("  Planta baja nueva ")).toBeNull();
  });

  it("cancels a rename without calling the API", () => {
    renderManager();

    const card = section("Planta baja");
    fireEvent.click(within(card).getByRole("button", { name: "Renombrar" }));
    fireEvent.click(within(card).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByDisplayValue("Planta baja")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deactivates an active floor and reactivates an inactive one", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager([makeFloor({ is_active: false })]);

    const toggle = screen.getByRole("button", { name: "Reactivar piso" });
    fireEvent.click(toggle);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/floors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "floor-1", isActive: true }),
    });
  });

  it("offers Desactivar piso for an active floor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager([makeFloor()]);

    expect(section("Planta baja").className).toContain("bg-neutral-900");
    fireEvent.click(screen.getByRole("button", { name: "Desactivar piso" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ id: "floor-1", isActive: false }),
    });
  });

  it("adds a box to a floor and closes the inline form", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByRole("button", { name: "+ Box" }));
    fireEvent.change(screen.getByPlaceholderText("Número (ej. PB-31)"), {
      target: { value: "PB-31" },
    });
    fireEvent.change(screen.getByPlaceholderText("Sector (opcional)"), {
      target: { value: "Fondo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ floorId: "floor-1", number: "PB-31", sector: "Fondo" }),
    });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Número (ej. PB-31)")).toBeNull(),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  // FIXED (FloorManager.tsx:283-285): the add box form used to wipe number/sector and close
  // itself even when the POST failed, so the operator had to retype everything.
  it("keeps the add box form open with its values when the create failed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Ya existe un box con ese número" }, false, 409),
    );
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByRole("button", { name: "+ Box" }));
    fireEvent.change(screen.getByPlaceholderText("Número (ej. PB-31)"), {
      target: { value: "PB-31" },
    });
    fireEvent.change(screen.getByPlaceholderText("Sector (opcional)"), {
      target: { value: "Fondo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(
      await screen.findByText("Ya existe un box con ese número"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Número (ej. PB-31)")).toHaveValue("PB-31");
    expect(screen.getByPlaceholderText("Sector (opcional)")).toHaveValue("Fondo");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("cancels the add box form", () => {
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByRole("button", { name: "+ Box" }));
    expect(screen.getByPlaceholderText("Número (ej. PB-31)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByPlaceholderText("Número (ej. PB-31)")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the API error and does not refresh", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Ya existe un piso así" }, false, 409));
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByTitle("Mover abajo"));

    expect(await screen.findByText("Ya existe un piso así")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic API error message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByTitle("Mover abajo"));

    expect(await screen.findByText("Error inesperado")).toBeInTheDocument();
  });

  it("reports a network failure as Error de red", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByTitle("Mover abajo"));

    expect(await screen.findByText("Error de red")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("disables the floor actions while a request is in flight", async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    renderManager();

    fireEvent.click(within(section("Planta baja")).getByTitle("Mover abajo"));

    await waitFor(() =>
      expect(within(section("Planta baja")).getByRole("button", { name: "Renombrar" })).toBeDisabled(),
    );
    expect(within(section("Piso 1")).getByRole("button", { name: "Renombrar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear piso" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear piso" })).toBeDisabled();

    release(jsonResponse({ ok: true }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});
