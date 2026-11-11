import Link from "next/link";
import { query } from "@/lib/db/client";
import { formatElapsed, formatTime } from "@/lib/format";
import { EgresoForm, type EgresoData, type FeeBreakdown } from "./egreso-form";

/**
 * Pantalla de egreso: con ?session=<id> muestra el desglose y el cobro;
 * sin sesión elegida, muestra la lista de estadías activas para elegir.
 */
export default async function EgresoPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Registrar egreso</h1>
          <p className="text-sm text-neutral-500">
            Elegí la estadía a cobrar
          </p>
        </header>
        <OpenStayPicker />
      </div>
    );
  }

  let data: EgresoData;
  try {
    data = await loadEgresoData(sessionId);
  } catch {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400">
        No se encontró la estadía indicada.{" "}
        <Link href="/operaciones/egreso" className="underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Registrar egreso</h1>
        <p className="text-sm text-neutral-500">
          Ticket #{data.ticketNumber} · Box {data.boxNumber} · ingresó{" "}
          {formatTime(data.entryAt)}
        </p>
      </header>
      <EgresoForm data={data} />
    </div>
  );
}

async function OpenStayPicker() {
  const stays = await query<{
    id: string;
    ticket_number: string;
    plate: string | null;
    box_number: string;
    entry_at: string;
    elapsed: number;
  }>(
    `SELECT s.id, s.ticket_number::text, v.plate, b.number AS box_number, s.entry_at,
            GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - s.entry_at)) / 60)::int) AS elapsed
       FROM parking_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id
       JOIN parking_boxes b ON b.id = s.box_id
      WHERE s.status = 'open'
      ORDER BY s.entry_at`,
  );

  if (stays.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
        No hay estadías activas para cobrar.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
      {stays.map((s) => (
        <li key={s.id}>
          <Link
            href={`/operaciones/egreso?session=${s.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
          >
            <div>
              <p className="font-semibold tracking-wide">{s.plate}</p>
              <p className="text-xs text-neutral-500">
                Ticket #{s.ticket_number} · Box {s.box_number} · {formatTime(s.entry_at)} ·{" "}
                {formatElapsed(s.elapsed)}
              </p>
            </div>
            <span className="text-xs text-neutral-400">Cobrar →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function loadEgresoData(sessionId: string): Promise<EgresoData> {
  const session = await query<{
    ticket_number: string;
    plate: string;
    vehicle_type_name: string;
    box_number: string;
    entry_at: string;
    elapsed: number;
  }>(
    `SELECT s.ticket_number::text, v.plate, vt.name AS vehicle_type_name,
            b.number AS box_number, s.entry_at::text,
            GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - s.entry_at)) / 60)::int) AS elapsed
       FROM parking_sessions s
       JOIN vehicles v ON v.id = s.vehicle_id
       JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
       JOIN parking_boxes b ON b.id = s.box_id
      WHERE s.id = $1 AND s.status = 'open'`,
    [sessionId],
  );
  if (session.length === 0) throw new Error("not found");
  const s = session[0]!;

  const quoteRows = await query<{ r: { elapsed_minutes: number; fee: FeeBreakdown } }>(
    `SELECT quote_exit($1) AS r`,
    [sessionId],
  );
  if (quoteRows.length === 0) throw new Error("not found");
  const quoteData = quoteRows[0]!.r;

  const methods = await query<{ id: string; name: string }>(
    `SELECT id, name FROM payment_methods WHERE is_active ORDER BY sort_order, name`,
  );

  return {
    sessionId,
    ticketNumber: s.ticket_number,
    plate: s.plate,
    vehicleTypeName: s.vehicle_type_name,
    boxNumber: s.box_number,
    entryAt: s.entry_at,
    elapsedMinutes: quoteData.elapsed_minutes,
    quote: quoteData.fee,
    methods,
  };
}
