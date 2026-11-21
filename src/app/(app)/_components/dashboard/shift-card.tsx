import Link from "next/link";
import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { formatElapsed } from "@/lib/format";
import { loadOpenShiftSummary } from "@/lib/queries/shift-summary";
import type { OpenShiftSummary } from "@/lib/shifts/types";

export interface ShiftCardProps {
  shift: OpenShiftSummary | null;
  canManage: boolean;
  /** Autos adentro de la sucursal, estén o no en el turno abierto. */
  branchOpenSessions: number;
}

/** Turno de caja abierto: quién lo abrió, recaudado y autos adentro. */
export function ShiftCard({ shift, canManage, branchOpenSessions }: ShiftCardProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-200">Turno de caja</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {shift
              ? `Abrió ${shift.openedByName} a las ${shift.openedAtLabel} hs`
              : "No hay turno abierto"}
          </p>
        </div>
        {canManage && (
          <Link
            href="/administracion/turnos"
            className="shrink-0 rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800"
          >
            Ver turnos
          </Link>
        )}
      </div>

      {shift ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-neutral-500">Recaudado en el turno</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">
              {shift.collectedLabel}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-neutral-500">Autos adentro (sucursal)</p>
            <p
              className={
                "mt-0.5 text-lg font-semibold tabular-nums " +
                (branchOpenSessions > 0 ? "text-amber-300" : "text-neutral-100")
              }
            >
              {branchOpenSessions}
            </p>
          </div>
          <p className="col-span-2 text-[11px] text-neutral-500">
            Abierto hace {formatElapsed(shift.elapsedMinutes)}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-neutral-400">
            Abrí un turno para registrar ingresos y cobros.{" "}
            {canManage && (
              <Link href="/administracion/turnos" className="underline">
                Abrir turno
              </Link>
            )}
          </p>
          {branchOpenSessions > 0 && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
              Hay {branchOpenSessions} auto{branchOpenSessions === 1 ? "" : "s"} adentro
              sin turno abierto. Al abrir uno, sus cobros quedarán en ese turno.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export async function ShiftCardSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const [shift, branchCount] = await Promise.all([
    loadOpenShiftSummary(context.branchId, {
      userId: context.user.userId,
      role: context.role,
    }),
    query<{ n: string }>(
      `SELECT count(*)::text AS n FROM parking_sessions
        WHERE branch_id = $1 AND status = 'open'`,
      [context.branchId],
    ),
  ]);
  return (
    <ShiftCard
      shift={shift}
      canManage={context.can("shift.manage")}
      branchOpenSessions={Number(branchCount[0]?.n ?? 0)}
    />
  );
}
