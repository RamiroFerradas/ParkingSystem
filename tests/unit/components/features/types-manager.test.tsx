import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TypesManager } from "@/app/(app)/vehiculos/tipos/types-manager";

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

const TYPES = [
  { id: "vt1", name: "Auto", is_active: true, sort_order: 1 },
  { id: "vt2", name: "Camioneta", is_active: true, sort_order: 2 },
  { id: "vt3", name: "Moto", is_active: false, sort_order: 3 },
];

function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function rowOf(name: string) {
  return screen.getByDisplayValue(name).closest("tr") as HTMLTableRowElement;
}

describe("TypesManager", () => {
  it("renders one editable row per vehicle type with its order", () => {
    render(<TypesManager types={TYPES} />);

    expect(screen.getByRole("heading", { name: "Tipos de vehículos" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Auto")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Camioneta")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Moto")).toBeInTheDocument();

    expect(within(rowOf("Auto")).getByText("1")).toBeInTheDocument();
    expect(within(rowOf("Moto")).getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
    expect(within(rowOf("Auto")).getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
  });

  it("explains that the name saves on blur and associated vehicles block deactivation", () => {
    render(<TypesManager types={TYPES} />);

    expect(
      screen.getByText(
        "Editá el nombre inline (se guarda al salir del campo). Un tipo con vehículos asociados no se puede desactivar.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the create button disabled until a name is typed", () => {
    render(<TypesManager types={TYPES} />);

    const create = screen.getByRole("button", { name: "Crear" });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: Camioneta)"), {
      target: { value: "   " },
    });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: Camioneta)"), {
      target: { value: "Bicicleta" },
    });
    expect(create).toBeEnabled();
  });

  it("creates a type with the next sort order and appends it", async () => {
    mockFetch(() =>
      jsonResponse({ type: { id: "vt4", name: "Bicicleta", is_active: true, sort_order: 4 } }),
    );
    render(<TypesManager types={TYPES} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: Camioneta)"), {
      target: { value: "Bicicleta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByDisplayValue("Bicicleta")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/vehicle-types");
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ name: "Bicicleta", sortOrder: 4 });
    expect((screen.getByPlaceholderText("Nombre (ej: Camioneta)") as HTMLInputElement).value).toBe("");
  });

  it("shows the server error and does not append the type", async () => {
    mockFetch(() => jsonResponse({ error: "El nombre ya existe" }, 409));
    render(<TypesManager types={TYPES} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: Camioneta)"), {
      target: { value: "Auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("El nombre ya existe")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByDisplayValue("Auto")).toHaveLength(1);
  });

  it("renames a type on blur and replaces the row with the server copy", async () => {
    mockFetch(() => jsonResponse({ type: { id: "vt2", name: "Pickup", is_active: true, sort_order: 2 } }));
    render(<TypesManager types={TYPES} />);

    const input = screen.getByDisplayValue("Camioneta");
    fireEvent.change(input, { target: { value: "  Pickup  " } });
    fireEvent.blur(input);

    expect(await screen.findByDisplayValue("Pickup")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/vehicle-types");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ id: "vt2", name: "Pickup" });
  });

  it("does not patch when the name is empty or unchanged", () => {
    render(<TypesManager types={TYPES} />);

    const input = screen.getByDisplayValue("Auto");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    fireEvent.change(input, { target: { value: "Auto" } });
    fireEvent.blur(input);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles the active flag with a PATCH and updates the label", async () => {
    mockFetch(() => jsonResponse({ type: { id: "vt3", name: "Moto", is_active: true, sort_order: 3 } }));
    render(<TypesManager types={TYPES} />);

    fireEvent.click(within(rowOf("Moto")).getByRole("button", { name: "Reactivar" }));

    expect(
      await within(rowOf("Moto")).findByRole("button", { name: "Desactivar" }),
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/vehicle-types");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ id: "vt3", isActive: true });
  });

  it("falls back to the HTTP status when the error body is empty", async () => {
    mockFetch(() => jsonResponse({}, 500));
    render(<TypesManager types={TYPES} />);

    fireEvent.change(screen.getByPlaceholderText("Nombre (ej: Camioneta)"), {
      target: { value: "Bicicleta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("Error 500")).toBeInTheDocument();
  });
});
