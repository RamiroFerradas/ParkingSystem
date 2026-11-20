import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { MobileNavProvider } from "@/components/shell/mobile-nav";
import type { BranchContext } from "@/lib/auth/context";
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

function makeContext(overrides: Partial<BranchContext> = {}): BranchContext {
  return {
    user: {
      userId: "u1",
      email: "ana@parking.test",
      name: "Ana Gómez",
      role: "admin",
      branchId: "b1",
      branchName: "Centro",
      isMaster: false,
    },
    branchId: "b1",
    branchName: "Centro",
    role: "admin",
    isMaster: false,
    memberships: [
      { branchId: "b1", branchName: "Centro", role: "admin" },
      { branchId: "b2", branchName: "Costanera", role: "admin" },
    ],
    can: vi.fn(() => true),
    ...overrides,
  };
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

/**
 * The header renders the mobile hamburger, which reads its shared state from
 * MobileNavProvider (mounted by the app layout, not by the header itself).
 */
function header(context: BranchContext, shift: OpenShiftSummary | null) {
  return (
    <MobileNavProvider groups={[]}>
      <AppHeader context={context} shift={shift} />
    </MobileNavProvider>
  );
}

function renderHeader(
  context: BranchContext,
  shift: OpenShiftSummary | null,
) {
  return render(header(context, shift));
}

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

describe("AppHeader", () => {
  it("shows the brand and the module subtitle", () => {
    renderHeader(makeContext(), null);

    expect(screen.getByText("Mauricio's Parking")).toBeInTheDocument();
    expect(screen.getByText("Gestión de estacionamiento")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("places the active branch in the branch pill", () => {
    renderHeader(makeContext(), null);

    expect(
      screen.getByRole("button", { name: /Centro/ }),
    ).toHaveAttribute("aria-haspopup", "menu");
  });

  it("falls back to the branch placeholder without an active branch", () => {
    renderHeader(makeContext({ branchId: null, branchName: null }), null);

    expect(
      screen.getByRole("button", { name: /Elegí una sucursal/ }),
    ).toBeInTheDocument();
  });

  it("renders the shift control only with the shift.manage permission", () => {
    const can = vi.fn(() => true);
    const { rerender } = renderHeader(makeContext({ can }), null);

    expect(can).toHaveBeenCalledWith("shift.manage");
    expect(screen.getByText("Sin turno abierto")).toBeInTheDocument();

    rerender(header(makeContext({ can: vi.fn(() => false) }), null));
    expect(screen.queryByText("Sin turno abierto")).toBeNull();
  });

  it("passes the open shift down to the shift control", () => {
    renderHeader(makeContext(), SHIFT);

    expect(
      screen.getByRole("button", { name: /Turno abierto/ }),
    ).toBeInTheDocument();
  });

  it("maps the role to its label in the user menu", () => {
    renderHeader(makeContext(), null);

    expect(
      screen.getByRole("button", { name: "Administrador" }),
    ).toBeInTheDocument();
  });

  it("falls back to the role key for unknown roles", () => {
    renderHeader(makeContext({ role: "supervisor" }), null);
    expect(screen.getByRole("button", { name: "Supervisor" })).toBeInTheDocument();
  });

  it("labels a master without a branch as Master", () => {
    renderHeader(
      makeContext({
        role: null,
        branchId: null,
        branchName: null,
        isMaster: true,
      }),
      null,
    );

    expect(screen.getByRole("button", { name: "Master" })).toBeInTheDocument();
  });

  it("shows the user identity and branch inside the user menu", async () => {
    const user = userEvent.setup();
    renderHeader(makeContext(), null);

    await user.click(screen.getByRole("button", { name: "Administrador" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Ana Gómez")).toBeInTheDocument();
    expect(menu).toHaveTextContent("Administrador · Centro");
  });
});
