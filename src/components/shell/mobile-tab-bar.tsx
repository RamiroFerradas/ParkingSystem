"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileMoreButton } from "./mobile-nav";
import { LinkPendingContent } from "./link-pending";
import { findActiveHref } from "./nav-config";

export type MobileTabIcon = "home" | "map" | "in" | "out";

export interface MobileTab {
  href: string;
  label: string;
  icon: MobileTabIcon;
}

function TabIcon({ icon }: { icon: MobileTabIcon }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (icon) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "in":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "out":
      return (
        <svg {...common}>
          <path d="M12 15V3" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
      );
  }
}

/**
 * Barra de navegación inferior (§mobile): las cuatro pantallas que un
 * administrador abre desde el teléfono, más "Más" para el resto del sistema.
 * El filtrado por permisos se resuelve en el servidor y llega como datos
 * planos, nunca como función.
 */
export function MobileTabBar({ tabs }: { tabs: MobileTab[] }) {
  const pathname = usePathname();
  const activeHref = findActiveHref(
    pathname,
    tabs.map((tab) => tab.href),
  );
  const anyTabActive = activeHref !== null;

  return (
    <nav
      aria-label="Navegación rápida"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-900/95 pb-safe backdrop-blur lg:hidden"
    >
      <ul className="flex items-stretch">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={
                  "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium " +
                  (active ? "text-amber-400" : "text-neutral-400")
                }
              >
                <LinkPendingContent
                  className="flex w-full flex-col items-center justify-center gap-1"
                  hintClassName="absolute right-1.5 top-1.5"
                  showHint={!active}
                >
                  <TabIcon icon={tab.icon} />
                  {tab.label}
                </LinkPendingContent>
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <MobileMoreButton active={!anyTabActive} />
        </li>
      </ul>
    </nav>
  );
}
