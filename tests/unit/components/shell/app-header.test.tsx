import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/app-header";
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

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

describe("AppHeader", () => {
  it("shows the brand and the module subtitle", () => {
    render(<AppHeader context={makeContext()} shift={null} />);

    expect(screen.getByText("Mauricio's Parking")).toBeInTheDocument();
    expect(screen.getByText("Gestión de estacionamiento")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("places the active branch in the branch pill", () => {
    render(<AppHeader context={makeContext()} shift={null} />);

    expect(
      screen.getByRole("button", { name: /Centro/ }),
    ).toHaveAttribute("aria-haspopup", "menu");
  });

  it("falls back to the branch placeholder without an active branch", () => {
    render(
      <AppHeader
        context={makeContext({ branchId: null, branchName: null })}
        shift={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Elegí una sucursal/ }),
    ).toBeInTheDocument();
  });

  it("renders the shift control only with the shift.manage permission", () => {
    const can = vi.fn(() => true);
    const { rerender } = render(
      <AppHeader context={makeContext({ can })} shift={null} />,
    );

    expect(can).toHaveBeenCalledWith("shift.manage");
    expect(screen.getByText("Sin turno abierto")).toBeInTheDocument();

    rerender(
      <AppHeader context={makeContext({ can: vi.fn(() => false) })} shift={null} />,
    );
    expect(screen.queryByText("Sin turno abierto")).toBeNull();
  });

  it("passes the open shift down to the shift control", () => {
    render(<AppHeader context={makeContext()} shift={SHIFT} />);

    expect(
      screen.getByRole("button", { name: /Turno abierto/ }),
    ).toBeInTheDocument();
  });

  it("maps the role to its label in the user menu", () => {
    render(<AppHeader context={makeContext()} shift={null} />);

    expect(
      screen.getByRole("button", { name: "Administrador" }),
    ).toBeInTheDocument();
  });

  it("falls back to the role key for unknown roles", () => {
    render(
      <AppHeader
        context={makeContext({ role: "supervisor" })}
        shift={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Supervisor" })).toBeInTheDocument();
  });

  it("labels a master without a branch as Master", () => {
    render(
      <AppHeader
        context={makeContext({
          role: null,
          branchId: null,
          branchName: null,
          isMaster: true,
        })}
        shift={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Master" })).toBeInTheDocument();
  });

  it("shows the user identity and branch inside the user menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader context={makeContext()} shift={null} />);

    await user.click(screen.getByRole("button", { name: "Administrador" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Ana Gómez")).toBeInTheDocument();
    expect(menu).toHaveTextContent("Administrador · Centro");
  });
});
