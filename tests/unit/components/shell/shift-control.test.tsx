import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ShiftControl } from "@/components/shell/shift-control";
import { ToastProvider } from "@/components/shell/toast";
import type { OpenShiftSummary } from "@/lib/shifts/types";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function response(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 400),
    json: async () => body,
  } as unknown as Response;
}

const SHIFT: OpenShiftSummary = {
  id: "s1",
  openedAtMs: Date.now() - 60 * 60_000,
  elapsedMinutes: 60,
  openedAtLabel: "08:30",
  openedByName: "Ana",
  collectedLabel: "$ 12.500,00",
  openSessions: 0,
  canClose: true,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderControl(shift: OpenShiftSummary | null) {
  return render(
    <ToastProvider>
      <ShiftControl shift={shift} />
    </ToastProvider>,
  );
}

describe("ShiftControl without an open shift", () => {
  it("shows the idle badge and the open action", () => {
    renderControl(null);

    expect(screen.getByText("Sin turno abierto")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir turno" }),
    ).toBeInTheDocument();
  });

  it("opens the shift, toasts and refreshes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    renderControl(null);

    await user.click(screen.getByRole("button", { name: "Abrir turno" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Turno abierto");
    expect(fetchMock).toHaveBeenCalledWith("/api/shifts/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("toasts the API error when opening fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response({ error: "Ya hay un turno abierto" }, { ok: false }),
    );
    renderControl(null);

    await user.click(screen.getByRole("button", { name: "Abrir turno" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Ya hay un turno abierto",
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("toasts a generic message when the server is unreachable", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("offline"));
    renderControl(null);

    await user.click(screen.getByRole("button", { name: "Abrir turno" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Servidor no disponible",
    );
  });

  it("disables the button and shows progress while opening", async () => {
    const user = userEvent.setup();
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((done) => (resolve = done)),
    );
    renderControl(null);

    await user.click(screen.getByRole("button", { name: "Abrir turno" }));

    expect(screen.getByRole("button", { name: "Abriendo..." })).toBeDisabled();

    await act(async () => {
      resolve(response({ ok: true }));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Turno abierto");
  });
});

describe("ShiftControl with an open shift", () => {
  it("summarises the shift on the chip", () => {
    renderControl({ ...SHIFT, openSessions: 2 });

    const chip = screen.getByRole("button", { name: /Turno abierto/ });
    expect(chip).toHaveTextContent("Hace 1 h 0 min");
    expect(chip).toHaveTextContent("2 autos");
    expect(chip).toHaveAttribute("aria-expanded", "false");
  });

  it("singularises the vehicle badge", () => {
    renderControl({ ...SHIFT, openSessions: 1 });
    expect(
      screen.getByRole("button", { name: /Turno abierto/ }),
    ).toHaveTextContent("1 auto");
  });

  it("opens the detail panel with the shift figures", async () => {
    const user = userEvent.setup();
    renderControl({ ...SHIFT, openSessions: 2 });

    await user.click(screen.getByRole("button", { name: /Turno abierto/ }));

    const dialog = screen.getByRole("dialog", { name: "Turno de caja" });
    expect(dialog).toHaveTextContent("Abrió Ana · 08:30 hs");
    expect(dialog).toHaveTextContent("$ 12.500,00");
    expect(dialog).toHaveTextContent("Autos adentro");
    expect(
      within(dialog).getByRole("link", { name: "Detalle" }),
    ).toHaveAttribute("href", "/administracion/turnos");
    expect(
      within(dialog).getByRole("link", { name: "Ver estadías" }),
    ).toHaveAttribute("href", "/operaciones/estadias");
  });

  it("closes the shift after confirming, toasts the total and refreshes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    renderControl(SHIFT);

    await user.click(screen.getByRole("button", { name: "Cerrar turno" }));
    const dialog = screen.getByRole("dialog", { name: "Turno de caja" });
    expect(dialog).toHaveTextContent("¿Cerrar el turno?");

    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar cierre" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Turno cerrado · Facturado $ 12.500,00",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/shifts/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the panel open and alerts when closing fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response({ error: "Turno ya cerrado" }, { ok: false }),
    );
    renderControl(SHIFT);

    await user.click(screen.getByRole("button", { name: "Cerrar turno" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirmar cierre",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Turno ya cerrado",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("alerts on a network failure while closing", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("offline"));
    renderControl(SHIFT);

    await user.click(screen.getByRole("button", { name: "Cerrar turno" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirmar cierre",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Servidor no disponible",
    );
  });

  it("hides closing from users who cannot close the shift", async () => {
    const user = userEvent.setup();
    renderControl({ ...SHIFT, canClose: false });

    expect(
      screen.queryByRole("button", { name: "Cerrar turno" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: /Turno abierto/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Solo Ana puede cerrar este turno.");
    expect(
      within(dialog).queryByRole("button", { name: "Cerrar turno" }),
    ).toBeNull();
  });

  it("warns about an overlong shift and offers the close as primary action", async () => {
    const user = userEvent.setup();
    renderControl({ ...SHIFT, elapsedMinutes: 500 });

    expect(
      screen.getByRole("button", { name: /¿lo cerraste\?/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /¿lo cerraste\?/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("¿Ya lo cerraste?");
  });

  it("recomputes the elapsed time every 30 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    renderControl({
      ...SHIFT,
      openedAtMs: Date.now() - (8 * 60 + 5) * 60_000,
      elapsedMinutes: 0,
    });

    expect(screen.queryByText(/¿lo cerraste\?/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText(/¿lo cerraste\?/)).toBeInTheDocument();
  });

  it("closes the panel with Escape", async () => {
    const user = userEvent.setup();
    renderControl(SHIFT);

    await user.click(screen.getByRole("button", { name: /Turno abierto/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the panel from the backdrop button", async () => {
    const user = userEvent.setup();
    renderControl(SHIFT);

    await user.click(screen.getByRole("button", { name: /Turno abierto/ }));
    await user.click(
      screen.getByRole("button", { name: "Cerrar panel del turno" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
