import { query } from "@/lib/db/client";
import { formatARS, formatTime } from "@/lib/format";
import { ShiftActions } from "./shift-actions";

interface ShiftView {
  id: string | null;
  opened_at: string | null;
  opened_by: string | null;
  totals: { method_name: string; total: string }[];
}

async function loadShift(): Promise<ShiftView> {
  const shifts = await query<{
    id: string;
    opened_at: string;
    opened_by: string;
  }>(
    `SELECT id, opened_at::text, p.full_name AS opened_by
       FROM cash_shifts cs
       JOIN profiles p ON p.id = cs.opened_by
      WHERE cs.status = 'open'
      LIMIT 1`,
  );

  if (shifts.length === 0) {
    return { id: null, opened_at: null, opened_by: null, totals: [] };
  }
  const current = shifts[0]!;

  const totals = await query<{ method_name: string; total: string }>(
    `SELECT pm.name AS method_name, COALESCE(SUM(p.amount_charged_cents), 0)::text AS total
       FROM cash_shifts cs
       CROSS JOIN payment_methods pm
       LEFT JOIN payments p ON p.method_id = pm.id AND p.shift_id = cs.id
      WHERE cs.id = $1
      GROUP BY pm.name, pm.sort_order
      ORDER BY pm.sort_order`,
    [current.id],
  );

  return {
    id: current.id,
    opened_at: current.opened_at,
    opened_by: current.opened_by,
    totals,
  };
}

export default async function TurnosPage() {
  const shift = await loadShift();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Turnos de caja</h1>
        <p className="text-sm text-neutral-500">
          Apertura y cierre manuales (BR-022): uno abre, otro puede cerrar.
        </p>
      </header>

      {shift.id ? (
        <>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <p className="text-sm font-medium text-emerald-400">Turno abierto</p>
            <p className="mt-1 text-sm text-neutral-300">
              Abrió {shift.opened_by} a las {shift.opened_at ? formatTime(shift.opened_at) : "—"} hs
            </p>
          </div>

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
