import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { UserMenu } from "@/components/shell/user-menu";
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
  openedAtMs: Date.now() - 90 * 60_000,
  elapsedMinutes: 90,
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
});

function renderMenu(props: Partial<ComponentProps<typeof UserMenu>> = {}) {
  return render(
    <UserMenu
      name="Ana Gómez"
      roleLabel="Empleado"
      branchName="Centro"
      shift={null}
      {...props}
    />,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Empleado/ }));
  return screen.getByRole("menu");
}

describe("UserMenu", () => {
  it("starts collapsed showing only the role label", () => {
    renderMenu();

    const trigger = screen.getByRole("button", { name: /Empleado/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the user name, role and branch when opened", async () => {
    const user = userEvent.setup();
    renderMenu();

    const menu = await openMenu(user);
    expect(menu).toHaveTextContent("Ana Gómez");
    expect(menu).toHaveTextContent("Empleado · Centro");
    expect(within(menu).getByRole("menuitem", { name: "Salir" })).toBeInTheDocument();
  });

  it("logs out directly when there is no open shift", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    renderMenu();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("intercepts logout with a shift guard dialog", async () => {
    const user = userEvent.setup();
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));

    const dialog = screen.getByRole("dialog", {
      name: "Cerrar turno antes de salir",
    });
    expect(dialog).toHaveTextContent("Tenés el turno abierto");
    expect(dialog).toHaveTextContent("Hace 1 h 30 min");
    expect(
      within(dialog).getByRole("button", { name: "Cerrar turno y salir" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Salir sin cerrar" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists the vehicles still inside and blocks closing in that case", async () => {
    const user = userEvent.setup();
    renderMenu({ shift: { ...SHIFT, openSessions: 2 } });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2 vehículos sin egreso");
    expect(
      within(dialog).getByRole("button", { name: "Cerrar turno y salir" }),
    ).toBeDisabled();
    expect(dialog).toHaveTextContent(
      "Para cerrar el turno primero registrá el egreso de los vehículos.",
    );
  });

  it("does not offer closing when another user opened the shift", async () => {
    const user = userEvent.setup();
    renderMenu({ shift: { ...SHIFT, canClose: false, openedByName: "Beto" } });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "Cerrar turno y salir" }),
    ).toBeNull();
    expect(dialog).toHaveTextContent("Solo Beto puede cerrar este turno.");
  });

  it("closes the shift and then logs out", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));
    await user.click(
      screen.getByRole("button", { name: "Cerrar turno y salir" }),
    );

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/shifts/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/logout", {
      method: "POST",
    });
  });

  it("shows the close error and stays in the guard dialog", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response({ error: "Hay vehículos sin egreso" }, { ok: false }),
    );
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));
    await user.click(
      screen.getByRole("button", { name: "Cerrar turno y salir" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Hay vehículos sin egreso");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Cerrar turno y salir" }),
    ).toBeEnabled();
  });

  it("reports an unavailable server when the close request throws", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("offline"));
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));
    await user.click(
      screen.getByRole("button", { name: "Cerrar turno y salir" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Servidor no disponible",
    );
  });

  it("logs out without closing when choosing that option", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));
    await user.click(screen.getByRole("button", { name: "Salir sin cerrar" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
  });

  it("closes the guard with Escape", async () => {
    const user = userEvent.setup();
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the guard with the Cancelar button", async () => {
    const user = userEvent.setup();
    renderMenu({ shift: SHIFT });

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Salir" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the menu from the backdrop button", async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);
    await user.click(
      screen.getByRole("button", { name: "Cerrar menú de usuario" }),
    );

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
