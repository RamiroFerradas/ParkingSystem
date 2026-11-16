import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";
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

      <SidebarNav />

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
