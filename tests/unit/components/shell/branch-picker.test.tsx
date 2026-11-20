import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BranchPicker } from "@/components/shell/branch-picker";
import type { BranchOption } from "@/components/shell/branch-pill";

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
  usePathname: () => "/login",
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

const OPTIONS: BranchOption[] = [
  { branchId: "b1", branchName: "Sucursal Norte", role: "admin" },
  { branchId: "b2", branchName: "Sucursal Sur", role: "employee" },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BranchPicker", () => {
  it("explains when the user has no branches assigned", () => {
    render(<BranchPicker options={[]} />);
    expect(
      screen.getByText(
        "No tenés sucursales asignadas. Pedile al administrador que te agregue a una.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders one button per branch with its role", () => {
    render(<BranchPicker options={OPTIONS} />);

    const norte = screen.getByRole("button", { name: /Sucursal Norte/ });
    expect(norte).toHaveTextContent("admin");
    expect(norte).toHaveTextContent("Entrar →");

    const sur = screen.getByRole("button", { name: /Sucursal Sur/ });
    expect(sur).toHaveTextContent("employee");
  });

  it("selects a branch, navigates home and refreshes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    render(<BranchPicker options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Sur/ }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // A successful switch must release the busy state, not leave the picker
    // disabled until the component unmounts.
    expect(screen.getByRole("button", { name: /Sucursal Norte/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Sucursal Sur/ })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-branch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ branchId: "b2" }),
      }),
    );
  });

  it("shows the pending label and disables the buttons while selecting", async () => {
    const user = userEvent.setup();
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((done) => (resolve = done)),
    );
    render(<BranchPicker options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));

    expect(screen.getByText("Entrando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sucursal Sur/ })).toBeDisabled();

    await act(async () => {
      resolve(response({ ok: true }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
  });

  it("surfaces the API error and stays on the picker", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ error: "forbidden" }, { ok: false }));
    render(<BranchPicker options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));

    expect(
      await screen.findByText("No podés entrar a esa sucursal."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Sucursal Norte/ })).toBeEnabled();
  });

  it("surfaces a network failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<BranchPicker options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));

    expect(
      await screen.findByText("No se pudo seleccionar la sucursal."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
