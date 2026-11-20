import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MethodsManager, type MethodView } from "@/app/(app)/administracion/medios-de-pago/methods-manager";

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

function mockFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
}

const METHODS: MethodView[] = [
  { id: "m1", code: "EFE", name: "Efectivo", is_active: true, sort_order: 1 },
  { id: "m2", code: "TAR", name: "Tarjeta", is_active: false, sort_order: 2 },
];

function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("MethodsManager", () => {
  it("renders the header and one row per payment method with its action buttons", () => {
    render(<MethodsManager methods={METHODS} />);

    expect(screen.getByRole("heading", { name: "Medios de pago" })).toBeInTheDocument();
    expect(screen.getByText("EFE")).toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Renombrar" })).toHaveLength(2);
  });

  it("keeps the create button disabled until both code and name are filled", () => {
    render(<MethodsManager methods={[]} />);

    const submit = screen.getByRole("button", { name: "Crear" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Código (ej. EFE)"), { target: { value: "MER" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Nombre (ej. Efectivo)"), {
      target: { value: "Mercado Pago" },
    });
    expect(submit).toBeEnabled();
  });

  it("creates a method, reloads the list and clears the form", async () => {
    mockFetch((url, init) => {
      if (url === "/api/payment-methods" && init?.method === "POST") {
        return jsonResponse({ method: { id: "m3" } });
      }
      return jsonResponse({
        methods: [...METHODS, { id: "m3", code: "MER", name: "Mercado Pago", is_active: true, sort_order: 3 }],
      });
    });
    render(<MethodsManager methods={METHODS} />);

    const code = screen.getByPlaceholderText("Código (ej. EFE)");
    const name = screen.getByPlaceholderText("Nombre (ej. Efectivo)");
    fireEvent.change(code, { target: { value: "MER" } });
    fireEvent.change(name, { target: { value: "Mercado Pago" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("Mercado Pago")).toBeInTheDocument();
    const [postUrl, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toBe("/api/payment-methods");
    expect(postInit.method).toBe("POST");
    expect(bodyOf(postInit)).toEqual({ code: "MER", name: "Mercado Pago" });

    const [getUrl, getInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(getUrl).toBe("/api/payment-methods");
    expect(getInit.method).toBe("GET");
    expect((code as HTMLInputElement).value).toBe("");
    expect((name as HTMLInputElement).value).toBe("");
  });

  it("shows the server error and keeps the form values when creation fails", async () => {
    mockFetch(() => jsonResponse({ error: "El código ya existe" }, 400));
    render(<MethodsManager methods={METHODS} />);

    const code = screen.getByPlaceholderText("Código (ej. EFE)");
    fireEvent.change(code, { target: { value: "EFE" } });
    fireEvent.change(screen.getByPlaceholderText("Nombre (ej. Efectivo)"), {
      target: { value: "Efectivo duplicado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("El código ya existe")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((code as HTMLInputElement).value).toBe("EFE");
  });

  it("falls back to a status message when the error body is unusable", async () => {
    mockFetch(() => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    }) as unknown as Response);
    render(<MethodsManager methods={METHODS} />);

    fireEvent.change(screen.getByPlaceholderText("Código (ej. EFE)"), { target: { value: "X" } });
    fireEvent.change(screen.getByPlaceholderText("Nombre (ej. Efectivo)"), { target: { value: "Y" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("Error 500")).toBeInTheDocument();
  });

  it("opens the rename dialog prefilled and patches the new name", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ method: {} });
      return jsonResponse({
        methods: [{ ...METHODS[0]!, name: "Efectivo en caja" }, METHODS[1]!],
      });
    });
    render(<MethodsManager methods={METHODS} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Renombrar" })[0]!);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Renombrar medio de pago" })).toBeInTheDocument();
    expect(within(dialog).getByText("EFE")).toBeInTheDocument();

    const input = within(dialog).getByLabelText("Nombre") as HTMLInputElement;
    expect(input.value).toBe("Efectivo");

    fireEvent.change(input, { target: { value: "Efectivo en caja" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar nombre" }));

    expect(await screen.findByText("Efectivo en caja")).toBeInTheDocument();
    const [patchUrl, patchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(patchUrl).toBe("/api/payment-methods");
    expect(patchInit.method).toBe("PATCH");
    expect(bodyOf(patchInit)).toEqual({ id: "m1", name: "Efectivo en caja" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the rename dialog without a request when the name is empty or unchanged", async () => {
    render(<MethodsManager methods={METHODS} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Renombrar" })[0]!);
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Nombre") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar nombre" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles the active flag and reloads the list", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ method: {} });
      return jsonResponse({
        methods: [{ ...METHODS[0]!, is_active: false }, METHODS[1]!],
      });
    });
    render(<MethodsManager methods={METHODS} />);

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
    const [patchUrl, patchInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(patchUrl).toBe("/api/payment-methods");
    expect(patchInit.method).toBe("PATCH");
    expect(bodyOf(patchInit)).toEqual({ id: "m1", isActive: false });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });
});
