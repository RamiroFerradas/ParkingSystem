import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db/client";
import { formatElapsed, formatARS, formatTime } from "@/lib/format";
import { historialScopeForSession } from "@/lib/auth/scope";

// La página consulta la DB en el servidor; en Next 16 dev la navegación se
// valida contra datos sin cachear. Se opta por ruta bloqueante (sin PPR).
export const instant = false;

interface OpenStay {
  id: string;
  ticket_number: string;
  plate: string | null;
  vehicle_type_name: string;
  box_number: string;
  entry_at: string;
  elapsed_minutes: number;
  quote_cents: string;
  key_left: boolean;
  damage_notes: string | null;
  abonado: boolean;
}

/** `ownerId` restringe a lo abierto por ese usuario (permiso `session.read_own`). */
async function loadOpenStays(ownerId?: string): Promise<OpenStay[]> {
  return query<OpenStay>(
    `SELECT s.id,
            s.ticket_number::text AS ticket_number,
            v.plate,
            vt.name AS vehicle_type_name,
            b.number AS box_number,
            s.entry_at,
            s.key_left,
            s.damage_notes,
            (s.subscription_id IS NOT NULL) AS abonado,
            GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - s.entry_at)) / 60)::int) AS elapsed_minutes,
            CASE WHEN s.subscription_id IS NOT NULL THEN '0'
                 ELSE (calc_fee_breakdown(b.branch_id, s.vehicle_type_id,
                     GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - s.entry_at)) / 60)::int))
                  ->>'total_cents')
            END AS quote_cents
       FROM parking_sessions s
       JOIN vehicles v       ON v.id = s.vehicle_id
       JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
       JOIN parking_boxes b  ON b.id = s.box_id
      WHERE s.status = 'open'
        AND ($1::uuid IS NULL OR s.opened_by = $1::uuid)
      ORDER BY s.entry_at`,
    [ownerId ?? null],
  );
}

export default function EstadiasActivasPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Estadías activas</h1>
          <p className="text-sm text-neutral-500">
            Vehículos dentro del estacionamiento en este momento
          </p>
        </div>
        <Link
          href="/operaciones/ingreso"
          className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          + Ingreso
        </Link>
      </header>

      <OpenStaysTable />
    </div>
  );
}

async function OpenStaysTable() {
  const scope = await historialScopeForSession();
  if (!scope) redirect("/login");
  const stays = await loadOpenStays(scope.ownerId);

  if (stays.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
        No hay estadías activas.
      </p>
    );
  }

  return (
    <>
      {/* Teléfono: una tarjeta por auto, con el botón de cobro a ancho completo. */}
      <ul className="space-y-2 md:hidden">
        {stays.map((s) => (
          <li
            key={s.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-base font-semibold tracking-wide">{s.plate}</p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  Ticket #{s.ticket_number} · {s.vehicle_type_name} · Box {s.box_number}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-emerald-400">
                {s.abonado ? "Abonado" : formatARS(s.quote_cents)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
              <span>Ingreso {formatTime(s.entry_at)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatElapsed(s.elapsed_minutes)}</span>
              {s.abonado ? (
                <span className="rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  Abonado
                </span>
              ) : null}
              {s.key_left ? (
                <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  Llave
                </span>
              ) : null}
            </div>
            {s.damage_notes ? (
              <p className="mt-1 line-clamp-2 text-[11px] text-red-300">
                Rotura: {s.damage_notes}
              </p>
            ) : null}
            <Link
              href={`/operaciones/egreso?session=${s.id}`}
              className="mt-3 flex min-h-11 items-center justify-center rounded-md bg-neutral-100 text-sm font-semibold text-neutral-900 hover:bg-white"
            >
              Cobrar
            </Link>
          </li>
        ))}
      </ul>

      <div className="scroll-x hidden rounded-xl border border-neutral-800 md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900 text-left text-xs text-neutral-500">
              <th className="px-4 py-2 font-medium">Ticket</th>
              <th className="px-4 py-2 font-medium">Patente</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Box</th>
              <th className="px-4 py-2 font-medium">Ingreso</th>
              <th className="px-4 py-2 font-medium">Tiempo</th>
              <th className="px-4 py-2 font-medium text-right">A cobrar</th>
              <th className="px-4 py-2" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {stays.map((s) => (
              <tr key={s.id} className="border-b border-neutral-800 last:border-0">
                <td className="px-4 py-2.5 tabular-nums text-neutral-400">#{s.ticket_number}</td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold tracking-wide">{s.plate}</span>
                  {s.abonado ? (
                    <span className="ml-2 rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      Abonado
                    </span>
                  ) : null}
                  {s.key_left ? (
                    <span className="ml-2 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      Llave
                    </span>
                  ) : null}
                  {s.damage_notes ? (
                    <p
                      title={s.damage_notes}
                      className="mt-0.5 max-w-56 truncate text-[11px] font-normal text-red-300"
                    >
                      Rotura: {s.damage_notes}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-neutral-300">{s.vehicle_type_name}</td>
                <td className="px-4 py-2.5 text-neutral-300">{s.box_number}</td>
                <td className="px-4 py-2.5 tabular-nums text-neutral-400">{formatTime(s.entry_at)}</td>
                <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatElapsed(s.elapsed_minutes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-400">
                  {s.abonado ? "Abonado" : formatARS(s.quote_cents)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/operaciones/egreso?session=${s.id}`}
                    className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                  >
                    Cobrar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
