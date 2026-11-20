import type { BranchContext } from "@/lib/auth/context";
import type { OpenShiftSummary } from "@/lib/shifts/types";
import { ROLE_LABELS } from "./nav-config";
import { BranchPill } from "./branch-pill";
import { ShiftControl } from "./shift-control";
import { ConnectivityBadge } from "./connectivity-badge";
import { UserMenu } from "./user-menu";

/**
 * Barra global del shell: dónde estoy (sucursal), estado del día (turno),
 * si puedo trabajar (conexión) y quién soy (usuario/salir). El sidebar queda
 * solo para navegar.
 */
export function AppHeader({
  context,
  shift,
}: {
  context: BranchContext;
  shift: OpenShiftSummary | null;
}) {
  return (
    <header className="relative flex h-16 shrink-0 items-stretch border-b border-neutral-800 bg-neutral-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-amber-400" aria-hidden="true" />

      <div className="flex w-60 shrink-0 items-center border-r border-neutral-800 px-4">
        <div>
          <p className="text-[13px] font-extrabold uppercase leading-none tracking-[0.16em] text-neutral-100">
            Mauricio&apos;s Parking
          </p>
          <p className="mt-1.5 text-xs text-neutral-500">Gestión de estacionamiento</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
        <BranchPill
          current={context.branchId}
          options={context.memberships}
          canManage={context.isMaster}
        />

        {context.can("shift.manage") ? (
          <ShiftControl key={shift?.id ?? "no-shift"} shift={shift} />
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <ConnectivityBadge />
          <UserMenu
            name={context.user.name}
            roleLabel={context.role ? (ROLE_LABELS[context.role] ?? context.role) : "Master"}
            branchName={context.branchName}
            shift={shift}
          />
        </div>
      </div>
    </header>
  );
}
