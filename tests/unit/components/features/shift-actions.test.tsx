import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShiftActions } from "@/app/(app)/administracion/turnos/shift-actions";
import { ToastProvider } from "@/components/shell/toast";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

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

function renderActions(props: Parameters<typeof ShiftActions>[0]) {
  return render(
    <ToastProvider>
      <ShiftActions {...props} />
    </ToastProvider>,
  );
}

function submitForm() {
  const form = screen.getByRole("button", { name: /Abrir turno|Cerrar turno/ }).closest("form");
  fireEvent.submit(form!);
}

describe("ShiftActions", () => {
  it("shows the opening form when there is no open shift", () => {
    renderActions({ open: false });

    expect(screen.getByLabelText("Notas de apertura (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir turno" })).toBeEnabled();
  });

  it("shows the closing form when a shift is open", () => {
    renderActions({ open: true });

    expect(screen.getByLabelText("Notas de cierre (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar turno" })).toBeEnabled();
  });

  it("blocks the employee from closing a shift opened by someone else", () => {
    renderActions({ open: true, canClose: false, openedByName: "Marta" });

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Solo Marta puede cerrar este turno/)).toBeInTheDocument();
  });

  it("uses a neutral fallback name when the opener is unknown", () => {
    renderActions({ open: true, canClose: false });

    expect(screen.getByText(/Solo quien abrió el turno puede cerrar este turno/)).toBeInTheDocument();
  });

  it("opens a shift with the typed notes and refreshes the route", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ shift: { id: "s1" } }));
    renderActions({ open: false });

    const notes = screen.getByLabelText("Notas de apertura (opcional)") as HTMLInputElement;
    fireEvent.change(notes, { target: { value: "caja inicial 5000" } });
    submitForm();

    expect(await screen.findByRole("status")).toHaveTextContent("Turno abierto");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/shifts/open");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ notes: "caja inicial 5000" });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(notes.value).toBe(""));
  });

  it("closes a shift and reports it with a toast", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ shift: { id: "s1" } }));
    renderActions({ open: true });

    fireEvent.change(screen.getByLabelText("Notas de cierre (opcional)"), {
      target: { value: "cierre normal" },
    });
    submitForm();

    expect(await screen.findByRole("status")).toHaveTextContent("Turno cerrado");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/shifts/close");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders the server error and skips the toast and refresh", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Ya hay un turno abierto" }, 409));
    renderActions({ open: false });

    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay un turno abierto");
    expect(screen.queryByRole("status")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the error body is empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    renderActions({ open: true });

    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo completar la operación");
  });

  it("reports an unreachable server and re-enables the button", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    renderActions({ open: false });

    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Servidor no disponible");
    expect(screen.getByRole("button", { name: "Abrir turno" })).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows progress while pending", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderActions({ open: false });

    submitForm();

    const pending = screen.getByRole("button", { name: "Procesando..." });
    expect(pending).toBeDisabled();

    resolveFetch?.(jsonResponse({}));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
});
