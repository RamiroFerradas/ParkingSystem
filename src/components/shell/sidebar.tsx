import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";
import { NAV_GROUPS, ROLE_LABELS } from "./nav-config";
import { ConnectivityBadge } from "./connectivity-badge";
import { LogoutButton } from "./logout-button";

export function Sidebar({ user }: { user: SessionUser }) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-4 py-4">
        <p className="text-sm font-semibold tracking-tight text-neutral-100">
          Parking System
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">Gestión de estacionamiento</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menú principal">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) =>
                item.enabled && item.href ? (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
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
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-1 top-full z-20 mt-0.5 hidden w-max max-w-52 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 shadow-lg group-hover:block"
                      >
                        {item.note ? `Se habilita en la ${item.note}` : "Disponible próximamente"}
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-neutral-800 px-4 py-3">
        <p className="truncate text-sm text-neutral-200">{user.name}</p>
        <p className="text-xs text-neutral-500">{ROLE_LABELS[user.role] ?? user.role}</p>
        <div className="mt-2 flex items-center justify-between">
          <ConnectivityBadge />
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
