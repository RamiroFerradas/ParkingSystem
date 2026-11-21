"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { findActiveHref, type NavGroup } from "./nav-config";
import { LinkPendingContent } from "./link-pending";

/** Recibe los grupos ya filtrados por rol desde el servidor. */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  // Un solo activo: el href más específico que coincida con la ruta actual.
  const activeHref = findActiveHref(
    pathname,
    groups.flatMap((group) =>
      group.items.map((item) => (item.enabled ? item.href : undefined)),
    ),
  );

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menú principal">
      {groups.map((group) => (
        <div key={group.label} className="mb-3">
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              if (!(item.enabled && item.href)) {
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled="true"
                      className="group relative block cursor-not-allowed rounded-md px-2 py-1.5 text-sm text-neutral-600"
                    >
                      {item.label}
                      {item.note ? (
                        <span className="mt-0.5 block text-[11px] text-neutral-500">
                          {item.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              }

              const active = item.href === activeHref;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "block rounded-md px-2 py-1.5 text-sm " +
                      (active
                        ? "bg-neutral-800 font-medium text-neutral-100"
                        : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100")
                    }
                  >
                    {/* El punto ámbar solo avisa de una navegación en curso:
                        sobre el ítem donde ya estás no dice nada. */}
                    <LinkPendingContent showHint={!active}>
                      {item.label}
                    </LinkPendingContent>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
