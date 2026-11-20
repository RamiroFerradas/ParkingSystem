import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { BranchPill, type BranchOption } from "@/components/shell/branch-pill";

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
  useLinkStatus: () => ({ pending: false }),
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

describe("BranchPill", () => {
  it("shows the placeholder when there is no active branch", () => {
    render(<BranchPill current={null} options={OPTIONS} canManage={false} />);

    const trigger = screen.getByRole("button", { name: /Elegí una sucursal/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the active branch name and opens the menu on click", async () => {
    const user = userEvent.setup();
    render(<BranchPill current="b1" options={OPTIONS} canManage={false} />);

    const trigger = screen.getByRole("button", { name: /Sucursal Norte/ });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("Cambiar sucursal");
    expect(menu).toHaveTextContent("Sucursal Sur");
    expect(menu).toHaveTextContent("employee");
    // The active branch gets a checkmark.
    expect(menu).toHaveTextContent("✓");
  });

  it("explains that a single branch cannot be switched", async () => {
    const user = userEvent.setup();
    render(
      <BranchPill current="b1" options={[OPTIONS[0]!]} canManage={false} />,
    );

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));

    expect(screen.getByRole("menu")).toHaveTextContent(
      "Tenés una sola sucursal asignada.",
    );
  });

  it("closes the menu without calling the API when choosing the current branch", async () => {
    const user = userEvent.setup();
    render(<BranchPill current="b1" options={OPTIONS} canManage={false} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));
    await user.click(
      within(screen.getByRole("menu")).getByRole("button", {
        name: /Sucursal Norte/,
      }),
    );

    expect(screen.queryByRole("menu")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the chosen branch and refreshes the server components", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    render(<BranchPill current="b1" options={OPTIONS} canManage={false} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));
    await user.click(screen.getByRole("button", { name: /Sucursal Sur/ }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/switch-branch",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: "b2" }),
      }),
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows an error and keeps the menu open when the switch is rejected", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ error: "forbidden" }, { ok: false }));
    render(<BranchPill current="b1" options={OPTIONS} canManage={false} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));
    await user.click(screen.getByRole("button", { name: /Sucursal Sur/ }));

    expect(
      await screen.findByText("No podés entrar a esa sucursal"),
    ).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows a network error when the request throws", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<BranchPill current="b1" options={OPTIONS} canManage={false} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));
    await user.click(screen.getByRole("button", { name: /Sucursal Sur/ }));

    expect(
      await screen.findByText("No se pudo cambiar de sucursal"),
    ).toBeInTheDocument();
  });

  it("offers the administration link only when allowed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BranchPill current="b1" options={OPTIONS} canManage={false} />,
    );

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));
    expect(
      screen.queryByRole("link", { name: /Administrar sucursales/ }),
    ).toBeNull();

    rerender(<BranchPill current="b1" options={OPTIONS} canManage />);
    const link = screen.getByRole("link", { name: /Administrar sucursales/ });
    expect(link).toHaveAttribute("href", "/sucursales");
  });

  it("closes the menu from the backdrop button", async () => {
    const user = userEvent.setup();
    render(<BranchPill current="b1" options={OPTIONS} canManage={false} />);

    await user.click(screen.getByRole("button", { name: /Sucursal Norte/ }));
    await user.click(
      screen.getByRole("button", { name: "Cerrar menú de sucursal" }),
    );

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
