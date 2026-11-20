"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "./nav-config";

// Ítem activo según la ruta actual: exacto para "/", prefijo para el resto
// (las subrutas quedan dentro de su sección, p. ej. /tarifas/productos).
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Recibe los grupos ya filtrados por rol desde el servidor. */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menú principal">
      {groups.map((group) => (
        <div key={group.label} className="mb-3">
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) =>
              item.enabled && item.href ? (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className={
                      "block rounded-md px-2 py-1.5 text-sm " +
                      (isActive(pathname, item.href)
                        ? "bg-neutral-800 font-medium text-neutral-100"
                        : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100")
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                  <span
                    aria-disabled="true"
                    className="group relative block cursor-not-allowed rounded-md px-2 py-1.5 text-sm text-neutral-600"
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
  );
}
