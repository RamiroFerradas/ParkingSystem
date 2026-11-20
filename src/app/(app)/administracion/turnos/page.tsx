import { query } from "@/lib/db/client";
import { formatARS, formatTime } from "@/lib/format";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShiftActions } from "./shift-actions";

interface ShiftView {
  id: string | null;
  opened_at: string | null;
  opened_by: string | null;
  totals: { method_name: string; total: string }[];
  openSessions: number;
  collected: string;
}

async function loadShift(): Promise<ShiftView> {
  const shifts = await query<{
    id: string;
    opened_at: string;
    opened_by: string;
  }>(
    `SELECT cs.id, cs.opened_at::text, p.full_name AS opened_by
       FROM cash_shifts cs
       JOIN profiles p ON p.id = cs.opened_by
      WHERE cs.status = 'open'
      LIMIT 1`,
  );

  if (shifts.length === 0) {
    return {
      id: null,
      opened_at: null,
      opened_by: null,
      totals: [],
      openSessions: 0,
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
    totals,
    openSessions: Number(summary[0]?.open_sessions ?? 0),
    collected: summary[0]?.collected ?? "0",
  };
}

export default async function TurnosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "shift.manage"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Requiere permiso de turnos de caja.
          </p>
        </div>
      </div>
    );
  }

  const shift = await loadShift();
  const canSeeReports = await hasPermission(user, "reports.read");
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Turnos de caja</h1>
          <p className="text-sm text-neutral-500">
            Uno abre, otro puede cerrar. Cada ingreso y cobro se atribuye al turno
            abierto y el turno no se cierra con autos adentro.
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
              Autos adentro: <span className="font-medium tabular-nums">{shift.openSessions}</span>
            </p>
          </div>

          {shift.openSessions > 0 && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Hay {shift.openSessions} vehículo{shift.openSessions === 1 ? "" : "s"} sin egreso.
              Registrá su salida antes de cerrar el turno.
            </p>
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

          <ShiftActions open={true} />
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
          <ShiftActions open={false} />
        </>
      )}
    </div>
  );
}
