import { query } from "@/lib/db/client";
import { formatARS, formatTime } from "@/lib/format";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessDenied } from "@/components/ui/access-denied";
import { Alert } from "@/components/ui/alert";
import { ShiftActions } from "./shift-actions";

interface ShiftView {
  id: string | null;
  opened_at: string | null;
  opened_by: string | null;
  opened_by_id: string | null;
  totals: { method_name: string; total: string }[];
  openSessions: number;
  /** Autos adentro de la sucursal, tengan o no turno asignado. */
  branchOpenSessions: number;
  collected: string;
}

async function loadShift(branchId: string | null): Promise<ShiftView> {
  if (!branchId) {
    return {
      id: null,
      opened_at: null,
      opened_by: null,
      opened_by_id: null,
      totals: [],
      openSessions: 0,
      branchOpenSessions: 0,
      collected: "0",
    };
  }
  const branchCount = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM parking_sessions
      WHERE branch_id = $1 AND status = 'open'`,
    [branchId],
  );
  const branchOpenSessions = Number(branchCount[0]?.n ?? 0);

  const shifts = await query<{
    id: string;
    opened_at: string;
    opened_by: string;
    opened_by_id: string;
  }>(
    `SELECT cs.id, cs.opened_at::text, p.email AS opened_by, cs.opened_by AS opened_by_id
       FROM cash_shifts cs
       JOIN profiles p ON p.id = cs.opened_by
      WHERE cs.status = 'open' AND cs.branch_id = $1
      LIMIT 1`,
    [branchId],
  );

  if (shifts.length === 0) {
    return {
      id: null,
      opened_at: null,
      opened_by: null,
      opened_by_id: null,
      totals: [],
      openSessions: 0,
      branchOpenSessions,
      collected: "0",
    };
  }
  const current = shifts[0]!;

  const [totals, summary] = await Promise.all([
    query<{ method_name: string; total: string }>(
      `SELECT pm.name AS method_name, COALESCE(SUM(p.amount_charged_cents), 0)::text AS total
         FROM cash_shifts cs
         CROSS JOIN payment_methods pm
         LEFT JOIN payments p ON p.method_id = pm.id AND p.shift_id = cs.id
        WHERE cs.id = $1
        GROUP BY pm.name, pm.sort_order
        ORDER BY pm.sort_order`,
      [current.id],
    ),
    query<{ open_sessions: string; collected: string }>(
      `SELECT (SELECT count(*) FROM parking_sessions
                WHERE shift_id = $1 AND status = 'open')::text AS open_sessions,
              (SELECT COALESCE(SUM(amount_charged_cents), 0) FROM payments
                WHERE shift_id = $1)::text AS collected`,
      [current.id],
    ),
  ]);

  return {
    id: current.id,
    opened_at: current.opened_at,
    opened_by: current.opened_by,
    opened_by_id: current.opened_by_id,
    totals,
    openSessions: Number(summary[0]?.open_sessions ?? 0),
    branchOpenSessions,
    collected: summary[0]?.collected ?? "0",
  };
}

export default async function TurnosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "shift.manage"))) {
    return <AccessDenied message="Requiere permiso de turnos de caja." />;
  }

  const shift = await loadShift(user.branchId);
  const canCloseShift =
    !shift.opened_by_id ||
    user.role === "admin" ||
    user.role === "supervisor" ||
    shift.opened_by_id === user.userId;
  const canSeeReports = await hasPermission(user, "reports.read");
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Turnos de caja</h1>
          <p className="text-sm text-neutral-500">
            El turno agrupa los ingresos y cobros de la jornada. El empleado cierra el
            turno que abrió; admin y supervisor, cualquiera. Se puede cerrar con autos
            adentro: se avisa y sus cobros quedan en el próximo turno.
          </p>
        </div>
        {canSeeReports && (
          <Link
            href="/reportes/turnos"
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Reporte de turnos
          </Link>
        )}
      </header>

      {shift.id ? (
        <>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <p className="text-sm font-medium text-emerald-400">Turno abierto</p>
            <p className="mt-1 text-sm text-neutral-300">
              Abrió {shift.opened_by} a las {shift.opened_at ? formatTime(shift.opened_at) : "—"} hs
            </p>
            <p className="mt-2 text-sm text-neutral-300">
              Facturado en el turno:{" "}
              <span className="font-medium tabular-nums">{formatARS(shift.collected)}</span>
              {" · "}
              Autos adentro:{" "}
              <span className="font-medium tabular-nums">{shift.branchOpenSessions}</span>
              {shift.branchOpenSessions > shift.openSessions && (
                <span className="text-xs text-amber-300">
                  {" "}
                  (incluye {shift.branchOpenSessions - shift.openSessions} de turnos anteriores)
                </span>
              )}
            </p>
          </div>

          {shift.branchOpenSessions > 0 && (
            <Alert tone="warning">
              Hay {shift.branchOpenSessions} vehículo
              {shift.branchOpenSessions === 1 ? "" : "s"} adentro
              {shift.branchOpenSessions > shift.openSessions
                ? ", incluidos los de turnos anteriores"
                : ""}
              . Podés cerrar el turno igual: seguirán estacionados y sus cobros quedarán
              en el próximo turno.
            </Alert>
          )}

          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-xs font-medium text-neutral-500">
              Recaudado durante el turno (conciliación manual)
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {shift.totals.map((t) => (
                <li key={t.method_name} className="flex justify-between">
                  <span className="text-neutral-300">{t.method_name}</span>
                  <span className="tabular-nums">{formatARS(t.total)}</span>
                </li>
              ))}
            </ul>
          </div>

          <ShiftActions
            open={true}
            canClose={canCloseShift}
            openedByName={shift.opened_by}
            openSessions={shift.branchOpenSessions}
          />
        </>
      ) : (
        <>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
            <p className="text-sm text-neutral-400">No hay turno abierto</p>
            <p className="mt-1 text-xs text-neutral-500">
              Abrí el turno al iniciar la jornada. Los ingresos y cobros se
              atribuyen al turno abierto al momento de registrarse.
            </p>
          </div>
          {shift.branchOpenSessions > 0 && (
            <Alert tone="warning">
              Hay {shift.branchOpenSessions} auto
              {shift.branchOpenSessions === 1 ? "" : "s"} adentro sin turno abierto. Al
              abrir uno, sus cobros quedarán en ese turno.
            </Alert>
          )}
          <ShiftActions open={false} />
        </>
      )}
    </div>
  );
}
