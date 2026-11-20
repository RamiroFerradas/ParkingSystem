import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";
import { TZ } from "@/lib/reports/period";

interface ShiftHeader {
  id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  minutes: string;
  opened_by_name: string;
  closed_by_name: string | null;
  opening_notes: string | null;
  closing_notes: string | null;
}

interface Summary {
  entered: string;
  still_open: string;
  paid_count: string;
  collected: string;
}

interface MethodRow {
  name: string;
  total: string;
  payments: string;
}

interface SessionRow {
  id: string;
  ticket_number: string;
  plate: string;
  vehicle_type: string;
  box_number: string;
  entry_at: string;
  exit_at: string | null;
  status: string;
  charged_cents: string | null;
  method_name: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseHour(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 23 ? n : null;
}

export default async function TurnoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "reports.read"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Requiere permiso de reportes (supervisor o administrador).
          </p>
        </div>
      </div>
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sp = await searchParams;
  const from = parseHour(sp.from);
  const to = parseHour(sp.to);
  const plateQuery = (sp.q ?? "").trim();
  const hourFilter = from !== null && to !== null;

  const headers = await query<ShiftHeader>(
    `SELECT cs.id,
            cs.status::text AS status,
            cs.opened_at::text,
            cs.closed_at::text,
            GREATEST(0, round(extract(epoch FROM (COALESCE(cs.closed_at, now()) - cs.opened_at)) / 60))::text AS minutes,
            po.email AS opened_by_name,
            pc.email AS closed_by_name,
            cs.opening_notes,
            cs.closing_notes
       FROM cash_shifts cs
       JOIN profiles po ON po.id = cs.opened_by
       LEFT JOIN profiles pc ON pc.id = cs.closed_by
      WHERE cs.id = $1`,
    [id],
  );
  const shift = headers[0];
  if (!shift) notFound();

  const [summaryRows, methods, sessions] = await Promise.all([
    query<Summary>(
      `SELECT (SELECT count(*) FROM parking_sessions WHERE shift_id = $1)::text AS entered,
              (SELECT count(*) FROM parking_sessions WHERE shift_id = $1 AND status = 'open')::text AS still_open,
              (SELECT count(*) FROM payments WHERE shift_id = $1)::text AS paid_count,
              (SELECT COALESCE(sum(amount_charged_cents), 0) FROM payments WHERE shift_id = $1)::text AS collected`,
      [id],
    ),
    query<MethodRow>(
      `SELECT pm.name,
              COALESCE(sum(p.amount_charged_cents), 0)::text AS total,
              count(p.id)::text AS payments
         FROM payment_methods pm
         LEFT JOIN payments p ON p.method_id = pm.id AND p.shift_id = $1
        GROUP BY pm.name, pm.sort_order
        ORDER BY pm.sort_order`,
      [id],
    ),
    query<SessionRow>(
      `SELECT s.id,
              s.ticket_number::text,
              v.plate,
              vt.name AS vehicle_type,
              b.number AS box_number,
              s.entry_at::text,
              s.exit_at::text,
              s.status::text,
              p.amount_charged_cents::text AS charged_cents,
              pm.name AS method_name
         FROM parking_sessions s
         JOIN vehicles v      ON v.id = s.vehicle_id
         JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
         JOIN parking_boxes b ON b.id = s.box_id
         LEFT JOIN payments p ON p.session_id = s.id
         LEFT JOIN payment_methods pm ON pm.id = p.method_id
        WHERE s.shift_id = $1
          AND ($2::int IS NULL OR $3::int IS NULL
               OR extract(hour FROM s.entry_at AT TIME ZONE '${TZ}')::int BETWEEN $2 AND $3)
          AND ($4::text IS NULL OR v.plate ILIKE '%' || $4 || '%')
        ORDER BY s.entry_at DESC`,
      [id, hourFilter ? from : null, hourFilter ? to : null, plateQuery || null],
    ),
  ]);

  const summary = summaryRows[0] ?? {
    entered: "0",
    still_open: "0",
    paid_count: "0",
    collected: "0",
  };
  const stillOpen = Number(summary.still_open);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Turno del {formatDate(shift.opened_at)} · {formatTime(shift.opened_at)}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Abrió <span className="text-neutral-300">{shift.opened_by_name}</span>
            {shift.closed_by_name ? (
              <>
                {" · cerró "}
                <span className="text-neutral-300">{shift.closed_by_name}</span>
                {shift.closed_at ? ` a las ${formatTime(shift.closed_at)}` : ""}
              </>
            ) : (
              " · turno abierto"
            )}
            {" · duración "}
            {formatElapsed(Number(shift.minutes))}
          </p>
        </div>
        <Link
          href="/reportes/turnos"
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Volver al reporte
        </Link>
      </header>

      {stillOpen > 0 && shift.status === "open" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Hay {stillOpen} vehículo{stillOpen === 1 ? "" : "s"} sin egreso en este turno.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Facturado" value={formatARS(summary.collected)} tone="green" />
        <Card label="Cobros" value={summary.paid_count} />
        <Card label="Autos ingresados" value={summary.entered} />
        <Card label="Autos adentro" value={summary.still_open} />
      </section>

      {(shift.opening_notes || shift.closing_notes) && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm">
          {shift.opening_notes && (
            <p>
              <span className="text-neutral-500">Apertura: </span>
              {shift.opening_notes}
            </p>
          )}
          {shift.closing_notes && (
            <p className="mt-1">
              <span className="text-neutral-500">Cierre: </span>
              {shift.closing_notes}
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <Th>Medio de pago</Th>
              <Th right>Cobros</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {methods.map((m) => (
              <tr key={m.name}>
                <Td>{m.name}</Td>
                <Td right>{m.payments}</Td>
                <Td right strong>{formatARS(m.total)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-200">
            Ingresos y egresos del turno
          </h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-neutral-500">
              Desde
              <select
                name="from"
                defaultValue={from ?? ""}
                className="ml-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="">—</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-500">
              Hasta
              <select
                name="to"
                defaultValue={to ?? ""}
                className="ml-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="">—</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <input
              name="q"
              defaultValue={plateQuery}
              placeholder="Patente"
              className="w-28 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Filtrar
            </button>
            {(hourFilter || plateQuery) && (
              <Link
                href={`/reportes/turnos/${id}`}
                className="px-1 py-1 text-xs text-neutral-400 underline"
              >
                Limpiar
              </Link>
            )}
          </form>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
              <tr>
                <Th>Ticket</Th>
                <Th>Patente</Th>
                <Th>Tipo</Th>
                <Th>Box</Th>
                <Th>Ingreso</Th>
                <Th>Egreso</Th>
                <Th right>Cobrado</Th>
                <Th>Medio</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-neutral-500">
                    Sin movimientos para el filtro.
                  </td>
                </tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className={s.status === "open" ? "bg-emerald-500/5" : undefined}>
                  <td className="px-3 py-2 tabular-nums">{s.ticket_number}</td>
                  <td className="px-3 py-2 font-medium">{s.plate}</td>
                  <td className="px-3 py-2 text-neutral-400">{s.vehicle_type}</td>
                  <td className="px-3 py-2 tabular-nums">{s.box_number}</td>
                  <td className="px-3 py-2 tabular-nums">{formatTime(s.entry_at)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.exit_at ? (
                      formatTime(s.exit_at)
                    ) : (
                      <span className="text-emerald-400">Adentro</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {s.charged_cents !== null ? formatARS(s.charged_cents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-neutral-400">{s.method_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">
          El filtro por hora usa la hora de ingreso (hora de Córdoba).
        </p>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green";
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={
          "mt-1 text-lg font-semibold tabular-nums " +
          (tone === "green" ? "text-emerald-400" : "text-neutral-100")
        }
      >
        {value}
      </p>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={"px-3 py-2 font-medium " + (right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={
        "px-3 py-2 " +
        (right ? "text-right tabular-nums " : "") +
        (strong ? "font-medium" : "")
      }
    >
      {children}
    </td>
  );
}
