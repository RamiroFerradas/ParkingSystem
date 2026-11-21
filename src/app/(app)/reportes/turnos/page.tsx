import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";
import { PERIODS, resolvePeriod } from "@/lib/reports/period";
import { AccessDenied } from "@/components/ui/access-denied";
import { Card, Td, Th } from "@/components/ui/report-table";

interface ShiftRow {
  id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string;
  closed_by_name: string | null;
  minutes: string;
  entered: string;
  paid_count: string;
  collected: string;
}

export default async function TurnosReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "reports.read"))) {
    return <AccessDenied message="Requiere permiso de reportes (supervisor o administrador)." />;
  }

  const params = await searchParams;
  const period = resolvePeriod(params.p);

  const rows = await query<ShiftRow>(
    `SELECT cs.id,
            cs.status::text AS status,
            cs.opened_at::text,
            cs.closed_at::text,
            po.email AS opened_by_name,
            pc.email AS closed_by_name,
            GREATEST(0, round(extract(epoch FROM (COALESCE(cs.closed_at, now()) - cs.opened_at)) / 60))::text AS minutes,
            (SELECT count(*) FROM parking_sessions s WHERE s.shift_id = cs.id)::text AS entered,
            (SELECT count(*) FROM payments p WHERE p.shift_id = cs.id)::text AS paid_count,
            (SELECT COALESCE(sum(p.amount_charged_cents), 0) FROM payments p WHERE p.shift_id = cs.id)::text AS collected
       FROM cash_shifts cs
       JOIN profiles po ON po.id = cs.opened_by
       LEFT JOIN profiles pc ON pc.id = cs.closed_by
      WHERE ${period.where("cs.opened_at")}
      ORDER BY cs.opened_at DESC
      LIMIT 200`,
  );

  const totals = rows.reduce(
    (acc, r) => ({
      collected: acc.collected + Number(r.collected),
      entries: acc.entries + Number(r.entered),
      payments: acc.payments + Number(r.paid_count),
    }),
    { collected: 0, entries: 0, payments: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Reporte de turnos</h1>
          <p className="text-sm text-neutral-500">
            Facturación y movimientos por turno de caja · período:{" "}
            {period.label.toLowerCase()}.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/reportes/turnos?p=${p.key}`}
              className={
                "rounded-md border px-2.5 py-1 text-xs " +
                (p.key === period.key
                  ? "border-neutral-400 bg-neutral-800 text-neutral-100"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800")
              }
            >
              {p.label}
            </Link>
          ))}
          <Link
            href="/reportes"
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Reportes generales
          </Link>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Card label="Turnos" value={String(rows.length)} size="md" />
        <Card label="Facturado" value={formatARS(totals.collected)} tone="green" size="md" />
        <Card label="Autos ingresados" value={String(totals.entries)} size="md" />
        <Card label="Cobros" value={String(totals.payments)} size="md" />
      </section>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <Th padding="compact" className="text-left">Turno</Th>
              <Th padding="compact" className="text-left">Abrió</Th>
              <Th padding="compact" className="text-left">Cerró</Th>
              <Th right padding="compact">Duración</Th>
              <Th right padding="compact">Autos</Th>
              <Th right padding="compact">Cobros</Th>
              <Th right padding="compact">Facturado</Th>
              <Th right padding="compact"> </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-neutral-500">
                  No hay turnos en el período.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-900/60">
                <Td padding="compact" tone="inherit">
                  <span className="tabular-nums">
                    {formatDate(r.opened_at)} {formatTime(r.opened_at)}
                  </span>
                  <span
                    className={
                      "ml-2 rounded px-1.5 py-0.5 text-[11px] " +
                      (r.status === "open"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-neutral-800 text-neutral-400")
                    }
                  >
                    {r.status === "open" ? "Abierto" : "Cerrado"}
                  </span>
                </Td>
                <Td padding="compact" tone="inherit">{r.opened_by_name}</Td>
                <Td padding="compact" tone="inherit">
                  {r.closed_by_name ?? "—"}
                  {r.closed_at && (
                    <span className="ml-1 text-xs text-neutral-500">
                      {formatTime(r.closed_at)}
                    </span>
                  )}
                </Td>
                <Td right padding="compact" tone="inherit">
                  {formatElapsed(Number(r.minutes))}
                </Td>
                <Td right padding="compact" tone="inherit">{r.entered}</Td>
                <Td right padding="compact" tone="inherit">{r.paid_count}</Td>
                <Td right strong padding="compact" tone="inherit">
                  {formatARS(r.collected)}
                </Td>
                <Td right padding="compact" tone="inherit">
                  <Link
                    href={`/reportes/turnos/${r.id}`}
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                  >
                    Ver detalle
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Los importes salen de los cobros registrados en cada turno. &quot;Autos&quot; cuenta
        los ingresos con ese turno asignado.
      </p>
    </div>
  );
}
