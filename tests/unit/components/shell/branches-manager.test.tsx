import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BranchesManager,
  type BranchRow,
} from "@/components/shell/branches-manager";

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
  usePathname: () => "/sucursales",
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

const BRANCHES: BranchRow[] = [
  { id: "b1", name: "Centro", code: "CEN", isActive: true, boxes: 12 },
  { id: "b2", name: "Costanera", code: null, isActive: false, boxes: 0 },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest("li");
  if (!row) throw new Error(`No li found for ${name}`);
  return row;
}

describe("BranchesManager", () => {
  it("shows an empty state without rows", () => {
    render(<BranchesManager branches={[]} />);
    expect(
      screen.getByText("Todavía no hay sucursales."),
    ).toBeInTheDocument();
  });

  it("renders each branch with its code, box count and state", () => {
    render(<BranchesManager branches={BRANCHES} />);

    const centro = rowFor("Centro");
    expect(centro).toHaveTextContent("CEN");
    expect(centro).toHaveTextContent("12 boxes");
    expect(centro).toHaveTextContent("Activa");

    const costanera = rowFor("Costanera");
    expect(costanera).toHaveTextContent("0 boxes");
    expect(costanera).toHaveTextContent("Inactiva");
  });

  it("prefills the edit form and cancels without saving", async () => {
    const user = userEvent.setup();
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(within(rowFor("Centro")).getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Centro");
    expect(screen.getByLabelText("Código")).toHaveValue("CEN");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Nombre")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves edits with PATCH, leaves edit mode and refreshes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(within(rowFor("Centro")).getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Centro Renovado");
    await user.clear(screen.getByLabelText("Código"));
    await user.type(screen.getByLabelText("Código"), "CEN2");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/branches/b1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Centro Renovado", code: "CEN2" }),
      }),
    );
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it("shows the PATCH error and stays in edit mode", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response({ error: "Nombre repetido" }, { ok: false }),
    );
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(within(rowFor("Centro")).getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Nombre repetido")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Centro");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("toggles the active state through PATCH", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(
      within(rowFor("Centro")).getByRole("button", { name: "Desactivar" }),
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/branches/b1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      }),
    );

    fetchMock.mockClear();
    router.refresh.mockClear();

    await user.click(
      within(rowFor("Costanera")).getByRole("button", { name: "Activar" }),
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/branches/b2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      }),
    );
  });

  it("confirms deletion and removes the row through DELETE", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(
      within(rowFor("Costanera")).getByRole("button", { name: "Eliminar" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Eliminar Costanera");
    expect(dialog).toHaveTextContent("se va a borrar definitivamente");

    await user.click(
      within(dialog).getByRole("button", { name: "Eliminar sucursal" }),
    );

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/branches/b2", {
      method: "DELETE",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the dialog open and shows the API error when DELETE fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response({ error: "Tiene boxes asociados" }, { ok: false }),
    );
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(
      within(rowFor("Costanera")).getByRole("button", { name: "Eliminar" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Eliminar sucursal",
      }),
    );

    expect(await screen.findByText("Tiene boxes asociados")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the delete dialog with the cancel button", async () => {
    const user = userEvent.setup();
    render(<BranchesManager branches={BRANCHES} />);

    await user.click(
      within(rowFor("Costanera")).getByRole("button", { name: "Eliminar" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
