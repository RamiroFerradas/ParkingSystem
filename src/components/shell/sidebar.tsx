import type { NavGroup } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";

/**
 * Navegación del shell. El contexto global (sucursal, turno, usuario) vive en
 * el header. En el teléfono no se renderiza: la navegación es la barra
 * inferior más la hoja "Más".
 */
export function Sidebar({ groups }: { groups: NavGroup[] }) {
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 lg:flex">
      <SidebarNav groups={groups} />
    </aside>
  );
}
