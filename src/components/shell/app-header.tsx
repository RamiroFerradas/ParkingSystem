import type { BranchContext } from "@/lib/auth/context";
import type { OpenShiftSummary } from "@/lib/shifts/types";
import { ROLE_LABELS } from "./nav-config";
import { BranchPill } from "./branch-pill";
import { ShiftControl } from "./shift-control";
import { ConnectivityBadge } from "./connectivity-badge";
import { UserMenu } from "./user-menu";
import { MobileMenuButton } from "./mobile-nav";
import { LiveStatus } from "./live-status";

/**
 * Barra global del shell: dónde estoy (sucursal), estado del día (turno),
 * si puedo trabajar (conexión) y quién soy (usuario/salir).
 *
 * En el teléfono se parte en dos filas: identidad + cuenta arriba, sucursal +
 * turno abajo. En escritorio vuelve a ser una sola fila de 64px. Los cinco
 * controles se renderizan una sola vez y se reordenan con `order`, así no hay
 * dos copias de estado para mantener sincronizadas.
 */
export function AppHeader({
  context,
  shift,
}: {
  context: BranchContext;
  shift: OpenShiftSummary | null;
}) {
  return (
    <header
      role="banner"
      className="relative flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2 lg:h-16 lg:flex-nowrap lg:gap-0 lg:px-0 lg:py-0"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-amber-400"
        aria-hidden="true"
      />

      <MobileMenuButton />

      <div className="flex min-w-0 flex-1 items-center lg:w-60 lg:flex-none lg:self-stretch lg:border-r lg:border-neutral-800 lg:px-4">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold uppercase leading-none tracking-[0.16em] text-neutral-100">
            Mauricio&apos;s Parking
          </p>
          <p className="mt-1.5 hidden text-xs text-neutral-500 lg:block">
            Gestión de estacionamiento
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:order-3 lg:ml-0 lg:pr-4">
        <LiveStatus />
        <ConnectivityBadge />
        <UserMenu
          name={context.user.name}
          roleLabel={
            context.role
              ? (ROLE_LABELS[context.role] ?? context.role)
              : context.isMaster
                ? "Master"
                : "Sin sucursal activa"
          }
          branchName={context.branchName}
          shift={shift}
        />
      </div>

      <div className="order-last flex w-full items-center gap-2 lg:order-2 lg:w-auto lg:flex-1 lg:px-4">
        <div className="min-w-0 flex-1 lg:flex-none">
          <BranchPill
            current={context.branchId}
            options={context.memberships}
            canManage={context.isMaster}
          />
        </div>

        {context.can("shift.manage") ? (
          <div className="shrink-0">
            <ShiftControl key={shift?.id ?? "no-shift"} shift={shift} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
