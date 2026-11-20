import type { BranchContext } from "@/lib/auth/context";
import { NAV_GROUPS, filterNavGroups } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";

/** Navegación del shell. El contexto global (sucursal, turno, usuario) vive en el header. */
export function Sidebar({ context }: { context: BranchContext }) {
  // El menú muestra solo lo que el usuario puede abrir en la sucursal activa:
  // el empleado no ve secciones de administración ni reportes, en vez de
  // chocar contra "Acceso restringido".
  const groups = filterNavGroups(NAV_GROUPS, context.can, {
    isMaster: context.isMaster,
  });

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <SidebarNav groups={groups} />
    </aside>
  );
}
