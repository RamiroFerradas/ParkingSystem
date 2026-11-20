import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import type { NavGroup } from "@/components/shell/nav-config";

const nav = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => nav.pathname,
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

const GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [{ label: "Dashboard", href: "/", enabled: true }],
  },
  {
    label: "Tarifas",
    items: [
      {
        label: "Productos tarifarios",
        href: "/tarifas/productos",
        enabled: true,
      },
      {
        label: "Tarifas especiales",
        href: "/tarifas/especiales",
        enabled: true,
      },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Sincronización", enabled: false, note: "Próximamente" },
      { label: "Sin destino", enabled: true },
    ],
  },
];

beforeEach(() => {
  nav.pathname = "/";
});

describe("SidebarNav", () => {
  it("renders an accessible nav landmark with every group label", () => {
    render(<SidebarNav groups={GROUPS} />);

    expect(
      screen.getByRole("navigation", { name: "Menú principal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByText("Tarifas")).toBeInTheDocument();
    expect(screen.getByText("Administración")).toBeInTheDocument();
  });

  it("marks the root link as current only on an exact match", () => {
    nav.pathname = "/";
    const { rerender } = render(<SidebarNav groups={GROUPS} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    nav.pathname = "/tarifas/productos";
    rerender(<SidebarNav groups={GROUPS} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getByRole("link", { name: "Productos tarifarios" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Tarifas especiales" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps a section active on its subroutes but not on lookalike prefixes", () => {
    nav.pathname = "/tarifas/productos/nuevo";
    const { rerender } = render(<SidebarNav groups={GROUPS} />);

    expect(
      screen.getByRole("link", { name: "Productos tarifarios" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Tarifas especiales" }),
    ).not.toHaveAttribute("aria-current");

    // "/tarifas/productos-viejos" must not count as a child of
    // "/tarifas/productos" (the separator is required).
    nav.pathname = "/tarifas/productos-viejos";
    rerender(<SidebarNav groups={GROUPS} />);
    expect(
      screen.getByRole("link", { name: "Productos tarifarios" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("renders disabled items as non-interactive spans", () => {
    render(<SidebarNav groups={GROUPS} />);

    const disabled = screen.getByText("Sincronización");
    expect(disabled.tagName).toBe("SPAN");
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("link", { name: "Sincronización" }),
    ).toBeNull();

    // `enabled: true` without `href` cannot navigate either.
    const noHref = screen.getByText("Sin destino");
    expect(noHref.tagName).toBe("SPAN");
    expect(noHref).toHaveAttribute("aria-disabled", "true");
  });

  it("renders the note of a disabled item under its label", () => {
    render(<SidebarNav groups={GROUPS} />);

    const disabled = screen.getByText("Sincronización");
    const note = screen.getByText("Próximamente");

    expect(note.tagName).toBe("SPAN");
    expect(disabled).toContainElement(note);
    expect(disabled).toHaveTextContent("Sincronización");
  });

  it("exposes the configured href on each enabled link", () => {
    render(<SidebarNav groups={GROUPS} />);
    expect(
      screen.getByRole("link", { name: "Productos tarifarios" }),
    ).toHaveAttribute("href", "/tarifas/productos");
  });
});
