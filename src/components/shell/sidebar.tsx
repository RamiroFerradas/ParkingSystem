import type { SessionUser } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
import { ROLE_LABELS, NAV_GROUPS, filterNavGroups } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";
import { ConnectivityBadge } from "./connectivity-badge";
import { LogoutButton } from "./logout-button";

export async function Sidebar({ user }: { user: SessionUser }) {
  // El menú muestra solo lo que el rol puede abrir: el empleado no ve
  // secciones de administración ni reportes, en vez de chocar contra
  // "Acceso restringido".
  const allowed = await permissionsFor(user.role);
  const groups = filterNavGroups(NAV_GROUPS, allowed);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-4 py-4">
        <p className="text-sm font-semibold tracking-tight text-neutral-100">
          Parking System
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">Gestión de estacionamiento</p>
      </div>

      <SidebarNav groups={groups} />

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
