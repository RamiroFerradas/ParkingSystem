import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";
import { PERIODS, resolvePeriod } from "@/lib/reports/period";

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

  const params = await searchParams;
  const period = resolvePeriod(params.p);

  const rows = await query<ShiftRow>(
    `SELECT cs.id,
            cs.status::text AS status,
            cs.opened_at::text,
            cs.closed_at::text,
            po.full_name AS opened_by_name,
            pc.full_name AS closed_by_name,
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reporte de turnos</h1>
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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Turnos" value={String(rows.length)} />
        <Card label="Facturado" value={formatARS(totals.collected)} tone="green" />
        <Card label="Autos ingresados" value={String(totals.entries)} />
        <Card label="Cobros" value={String(totals.payments)} />
      </section>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <Th>Turno</Th>
              <Th>Abrió</Th>
              <Th>Cerró</Th>
              <Th right>Duración</Th>
              <Th right>Autos</Th>
              <Th right>Cobros</Th>
              <Th right>Facturado</Th>
              <Th right> </Th>
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
                <td className="px-3 py-2">
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
                </td>
                <td className="px-3 py-2">{r.opened_by_name}</td>
                <td className="px-3 py-2">
                  {r.closed_by_name ?? "—"}
                  {r.closed_at && (
                    <span className="ml-1 text-xs text-neutral-500">
                      {formatTime(r.closed_at)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatElapsed(Number(r.minutes))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.entered}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.paid_count}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatARS(r.collected)}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/reportes/turnos/${r.id}`}
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                  >
                    Ver detalle
                  </Link>
                </td>
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
