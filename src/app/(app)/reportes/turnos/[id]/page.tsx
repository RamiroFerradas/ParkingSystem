import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";
import { loadShiftDetail } from "@/lib/queries/shift-detail";
import { AccessDenied } from "@/components/ui/access-denied";
import { Card, Td, Th } from "@/components/ui/report-table";

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
    return <AccessDenied message="Requiere permiso de reportes (supervisor o administrador)." />;
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sp = await searchParams;
  const from = parseHour(sp.from);
  const to = parseHour(sp.to);
  const plateQuery = (sp.q ?? "").trim();
  const hourFilter = from !== null && to !== null;

  const detail = await loadShiftDetail(id, { from, to, plateQuery });
  if (!detail) notFound();

  const { shift, summary, methods, sessions } = detail;
  const stillOpen = Number(summary.still_open);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
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

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Card label="Facturado" value={formatARS(summary.collected)} tone="green" size="md" />
        <Card label="Cobros" value={summary.paid_count} size="md" />
        <Card label="Autos ingresados" value={summary.entered} size="md" />
        <Card label="Autos adentro" value={summary.still_open} size="md" />
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
              <Th padding="compact" className="text-left">Medio de pago</Th>
              <Th right padding="compact">Cobros</Th>
              <Th right padding="compact">Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {methods.map((m) => (
              <tr key={m.name}>
                <Td padding="compact" tone="inherit">{m.name}</Td>
                <Td right padding="compact" tone="inherit">{m.payments}</Td>
                <Td right strong padding="compact" tone="inherit">{formatARS(m.total)}</Td>
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
                <Th padding="compact" className="text-left">Ticket</Th>
                <Th padding="compact" className="text-left">Patente</Th>
                <Th padding="compact" className="text-left">Tipo</Th>
                <Th padding="compact" className="text-left">Box</Th>
                <Th padding="compact" className="text-left">Ingreso</Th>
                <Th padding="compact" className="text-left">Egreso</Th>
                <Th right padding="compact">Cobrado</Th>
                <Th padding="compact" className="text-left">Medio</Th>
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
