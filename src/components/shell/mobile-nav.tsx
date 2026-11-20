"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { NavGroup } from "./nav-config";
import { LinkPendingContent } from "./link-pending";

interface MobileNavValue {
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
}

/**
 * Valor por defecto sin efecto: el header se puede renderizar aislado (tests,
 * stories) sin explotar. En la app real siempre hay un provider envolviendo.
 */
const NOOP: MobileNavValue = {
  open: false,
  openMenu: () => {},
  closeMenu: () => {},
};

const MobileNavContext = createContext<MobileNavValue>(NOOP);

function useMobileNav(): MobileNavValue {
  return useContext(MobileNavContext);
}

// Ítem activo según la ruta actual: exacto para "/", prefijo para el resto.
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Estado compartido del menú móvil: el botón hamburguesa del header y la
 * pestaña "Más" de la barra inferior abren la misma hoja, así no hay dos
 * menús con contenidos distintos.
 */
export function MobileNavProvider({
  groups,
  children,
}: {
  groups: NavGroup[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, openMenu, closeMenu }),
    [open, openMenu, closeMenu],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={value}>
      {children}
      <MobileNavSheet groups={groups} />
    </MobileNavContext.Provider>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/** Botón hamburguesa del header. Solo existe en pantallas chicas. */
export function MobileMenuButton() {
  const { open, openMenu } = useMobileNav();
  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label="Abrir menú de secciones"
      aria-haspopup="dialog"
      aria-expanded={open}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-neutral-200 hover:border-neutral-500 lg:hidden"
    >
      <MenuIcon />
    </button>
  );
}

/** Entrada "Más" de la barra inferior: abre el mismo menú. */
export function MobileMoreButton({ active }: { active: boolean }) {
  const { open, openMenu } = useMobileNav();
  return (
    <button
      type="button"
      onClick={openMenu}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium " +
        (active ? "text-amber-400" : "text-neutral-400")
      }
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      Más
    </button>
  );
}

function MobileNavSheet({ groups }: { groups: NavGroup[] }) {
  const { open, closeMenu } = useMobileNav();
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <button
        type="button"
        aria-label="Cerrar menú de secciones"
        onClick={closeMenu}
        className="dialog-overlay absolute inset-0 cursor-default bg-black/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú de secciones"
        className="dialog-panel absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col border-r border-neutral-700 bg-neutral-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 pb-safe">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold uppercase leading-none tracking-[0.16em] text-neutral-100">
              Mauricio&apos;s Parking
            </p>
            <p className="mt-1.5 text-xs text-neutral-500">Todas las secciones</p>
          </div>
          <button
            type="button"
            onClick={closeMenu}
            aria-label="Cerrar menú"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-300"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav
          aria-label="Menú de secciones"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-3 pb-safe"
        >
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) =>
                  item.enabled && item.href ? (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        aria-current={
                          isActive(pathname, item.href) ? "page" : undefined
                        }
                        className={
                          "flex min-h-12 items-center rounded-md px-3 text-sm " +
                          (isActive(pathname, item.href)
                            ? "bg-neutral-800 font-medium text-neutral-100"
                            : "text-neutral-300 active:bg-neutral-800")
                        }
                      >
                        <LinkPendingContent>{item.label}</LinkPendingContent>
                      </Link>
                    </li>
                  ) : (
                    <li key={item.label}>
                      <span
                        aria-disabled="true"
                        className="flex min-h-12 cursor-not-allowed items-center rounded-md px-3 text-sm text-neutral-600"
                      >
                        {item.label}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
