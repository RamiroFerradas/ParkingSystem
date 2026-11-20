import type { BranchContext } from "@/lib/auth/context";
import { ROLE_LABELS, NAV_GROUPS, filterNavGroups } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";
import { ConnectivityBadge } from "./connectivity-badge";
import { LogoutButton } from "./logout-button";
import { BranchPill } from "./branch-pill";

export function Sidebar({ context }: { context: BranchContext }) {
  // El menú muestra solo lo que el usuario puede abrir en la sucursal activa:
  // el empleado no ve secciones de administración ni reportes, en vez de
  // chocar contra "Acceso restringido".
  const groups = filterNavGroups(NAV_GROUPS, context.can, {
    isMaster: context.isMaster,
  });

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-4 py-4">
        <p className="text-sm font-semibold tracking-tight text-neutral-100">
          Parking System
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">Gestión de estacionamiento</p>
      </div>

      <div className="border-b border-neutral-800 px-4 py-3">
        <BranchPill
          current={context.branchId}
          options={context.memberships}
          canManage={context.isMaster}
        />
      </div>

      <SidebarNav groups={groups} />

      <div className="border-t border-neutral-800 px-4 py-3">
        <p className="truncate text-sm text-neutral-200">{context.user.name}</p>
        <p className="text-xs text-neutral-500">
          {context.role ? (ROLE_LABELS[context.role] ?? context.role) : "Master"}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <ConnectivityBadge />
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
