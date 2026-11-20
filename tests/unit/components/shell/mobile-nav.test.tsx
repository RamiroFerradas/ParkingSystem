import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MobileNavProvider, MobileMenuButton } from "@/components/shell/mobile-nav";
import type { NavGroup } from "@/components/shell/nav-config";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
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

const GROUPS: NavGroup[] = [
  {
    label: "Operaciones",
    items: [
      { label: "Registrar ingreso", href: "/operaciones/ingreso", enabled: true },
      { label: "Historial", href: "/operaciones/historial", enabled: true },
    ],
  },
  {
    label: "Estadísticas",
    items: [{ label: "Reportes", href: "/reportes", enabled: true }],
  },
];

function renderMenu() {
  return render(
    <MobileNavProvider groups={GROUPS}>
      <MobileMenuButton />
    </MobileNavProvider>,
  );
}

beforeEach(() => {
  document.body.style.overflow = "";
});

describe("MobileNavProvider", () => {
  it("keeps the sheet closed until the hamburger is pressed", () => {
    renderMenu();
    expect(screen.queryByRole("dialog", { name: "Menú de secciones" })).toBeNull();
  });

  it("opens every nav group in one sheet", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Abrir menú de secciones" }));

    const sheet = screen.getByRole("dialog", { name: "Menú de secciones" });
    expect(within(sheet).getByText("Operaciones")).toBeInTheDocument();
    expect(within(sheet).getByText("Estadísticas")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Reportes" })).toHaveAttribute(
      "href",
      "/reportes",
    );
  });

  it("closes when a destination is chosen", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Abrir menú de secciones" }));
    await user.click(screen.getByRole("link", { name: "Reportes" }));

    expect(screen.queryByRole("dialog", { name: "Menú de secciones" })).toBeNull();
  });

  it("closes on Escape and restores page scrolling", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Abrir menú de secciones" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Menú de secciones" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("marks the current route inside the sheet", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Abrir menú de secciones" }));

    expect(screen.getByRole("link", { name: "Reportes" })).not.toHaveAttribute("aria-current");
  });
});
