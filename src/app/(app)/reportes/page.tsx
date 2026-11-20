import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatARS, formatDate } from "@/lib/format";
import Link from "next/link";

export const TZ = "America/Argentina/Cordoba";

const PERIODS: { key: string; label: string; where: (col: string) => string }[] = [
  {
    key: "hoy",
    label: "Hoy",
    where: (c) => `(${c} AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`,
  },
  { key: "7", label: "7 días", where: (c) => `${c} >= now() - interval '7 days'` },
  { key: "30", label: "30 días", where: (c) => `${c} >= now() - interval '30 days'` },
  { key: "90", label: "90 días", where: (c) => `${c} >= now() - interval '90 days'` },
  {
    key: "mes",
    label: "Este mes",
    where: (c) =>
      `date_trunc('month', ${c} AT TIME ZONE '${TZ}') = date_trunc('month', now() AT TIME ZONE '${TZ}')`,
  },
  {
    key: "anio",
    label: "Este año",
    where: (c) =>
      `date_trunc('year', ${c} AT TIME ZONE '${TZ}') = date_trunc('year', now() AT TIME ZONE '${TZ}')`,
  },
];

const DAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

export default async function ReportesPage({
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
  const period = PERIODS.find((p) => p.key === params.p) ?? PERIODS[3]!; // default 30 días
  const paid = period.where("p.paid_at");
  const entry = period.where("s.entry_at");
  const exit = period.where("s.exit_at");

  const [totals, daily, byMethod, byVehicleType, byTariff, byEmployee, peakHours, heat, topBoxes] =
    await Promise.all([
      query<{ sessions: string; collected: string; avg_cents: string; avg_minutes: string }>(
        `SELECT count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected,
                COALESCE(round(avg(p.amount_charged_cents)), 0)::text AS avg_cents,
                COALESCE(round(avg(s.duration_minutes)), 0)::text AS avg_minutes
           FROM payments p
           JOIN parking_sessions s ON s.id = p.session_id
          WHERE ${paid}`,
      ),
      query<{ day: string; sessions: string; collected: string }>(
        `SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date::text AS day,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE ${paid}
          GROUP BY day ORDER BY day DESC`,
      ),
      query<{ method_name: string; sessions: string; collected: string }>(
        `SELECT m.name AS method_name, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p JOIN payment_methods m ON m.id = p.method_id
          WHERE ${paid}
          GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
      ),
      query<{ vehicle_type: string; sessions: string; collected: string }>(
        `SELECT vt.name AS vehicle_type, count(*)::text AS sessions,
                COALESCE(sum(s.final_amount_cents), 0)::text AS collected
           FROM parking_sessions s JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
          WHERE s.status = 'closed' AND ${exit}
          GROUP BY vt.name ORDER BY sum(s.final_amount_cents) DESC`,
      ),
      query<{ tariff_name: string; sessions: string; collected: string }>(
        `SELECT COALESCE(s.tariff_snapshot->'block'->>'name', '—') AS tariff_name,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p JOIN parking_sessions s ON s.id = p.session_id
          WHERE ${paid}
          GROUP BY tariff_name ORDER BY sum(p.amount_charged_cents) DESC LIMIT 15`,
      ),
      query<{ operator: string; sessions: string; collected: string }>(
        `SELECT COALESCE(pr.full_name, '—') AS operator, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN parking_sessions s ON s.id = p.session_id
           LEFT JOIN profiles pr ON pr.id = s.closed_by
          WHERE ${paid}
          GROUP BY operator ORDER BY sum(p.amount_charged_cents) DESC LIMIT 15`,
      ),
      query<{ hour: number; count: string }>(
        `SELECT EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS hour,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE ${entry}
          GROUP BY hour ORDER BY hour`,
      ),
      query<{ dow: number; hour: number; count: string }>(
        `SELECT EXTRACT(DOW FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS dow,
                EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS hour,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE ${entry}
          GROUP BY dow, hour`,
      ),
      query<{ box_number: string; sessions: string; collected: string }>(
        `SELECT b.number AS box_number, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN parking_sessions s ON s.id = p.session_id
           JOIN parking_boxes b ON b.id = s.box_id
          WHERE ${paid}
          GROUP BY b.number ORDER BY sum(p.amount_charged_cents) DESC LIMIT 10`,
      ),
    ]);

  const t = totals[0] ?? { sessions: "0", collected: "0", avg_cents: "0", avg_minutes: "0" };
  const maxHour = Math.max(1, ...peakHours.map((h) => Number(h.count)));
  const maxHeat = Math.max(1, ...heat.map((c) => Number(c.count)));
  const heatMap = new Map(heat.map((c) => [`${c.dow}-${c.hour}`, Number(c.count)]));
  const hourMap = new Map(peakHours.map((h) => [h.hour, Number(h.count)]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-neutral-500">
            Facturación y estadísticas · período: {period.label.toLowerCase()}.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/reportes?p=${p.key}`}
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
            href="/reportes/boxes"
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Ranking de boxes
          </Link>
          <a
            href={`/api/reports/export?p=${period.key}`}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Exportar CSV
          </a>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Recaudación" value={formatARS(t.collected)} tone="green" />
        <Card label="Cobros" value={t.sessions} />
        <Card label="Ticket promedio" value={formatARS(t.avg_cents)} />
        <Card label="Duración promedio" value={`${Number(t.avg_minutes)} min`} />
      </section>

      <Row title="Recaudación por medio de pago">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Medio</Th>
            <Th right>Cobros</Th>
            <Th right>Total</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {byMethod.length === 0 && <Empty cols={3} />}
          {byMethod.map((m) => (
            <tr key={m.method_name}>
              <Td>{m.method_name}</Td>
              <Td right>{m.sessions}</Td>
              <Td right strong>{formatARS(m.collected)}</Td>
            </tr>
          ))}
        </tbody>
      </Row>

      <Row title="Por tipo de vehículo">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Tipo</Th>
            <Th right>Estadías</Th>
            <Th right>Facturado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {byVehicleType.length === 0 && <Empty cols={3} />}
          {byVehicleType.map((v) => (
            <tr key={v.vehicle_type}>
              <Td>{v.vehicle_type}</Td>
              <Td right>{v.sessions}</Td>
              <Td right strong>{formatARS(v.collected)}</Td>
            </tr>
          ))}
        </tbody>
      </Row>

      <Row title="Por tarifa aplicada (snapshot)">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Tarifa</Th>
            <Th right>Cobros</Th>
            <Th right>Total</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {byTariff.length === 0 && <Empty cols={3} />}
          {byTariff.map((x) => (
            <tr key={x.tariff_name}>
              <Td>{x.tariff_name}</Td>
              <Td right>{x.sessions}</Td>
              <Td right strong>{formatARS(x.collected)}</Td>
            </tr>
          ))}
        </tbody>
      </Row>

      <Row title="Por empleado que cerró el cobro">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Empleado</Th>
            <Th right>Cobros</Th>
            <Th right>Total</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {byEmployee.length === 0 && <Empty cols={3} />}
          {byEmployee.map((x) => (
            <tr key={x.operator}>
              <Td>{x.operator}</Td>
              <Td right>{x.sessions}</Td>
              <Td right strong>{formatARS(x.collected)}</Td>
            </tr>
          ))}
        </tbody>
      </Row>

      <Row title="Ranking de boxes por facturación">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Box</Th>
            <Th right>Cobros</Th>
            <Th right>Facturado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {topBoxes.length === 0 && <Empty cols={3} />}
          {topBoxes.map((b) => (
            <tr key={b.box_number}>
              <Td mono>{b.box_number}</Td>
              <Td right>{b.sessions}</Td>
              <Td right strong>{formatARS(b.collected)}</Td>
            </tr>
          ))}
        </tbody>
      </Row>

      <section className="rounded-xl border border-neutral-800">
        <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
          Horas pico de ingresos
        </h2>
        <div className="flex items-end gap-1 px-4 py-4">
          {Array.from({ length: 24 }, (_, h) => {
            const n = hourMap.get(h) ?? 0;
            const height = n === 0 ? 2 : Math.max(4, Math.round((n / maxHour) * 100));
            return (
              <div key={h} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-emerald-500/70"
                  style={{ height: `${height}px` }}
                  title={`${h}:00 — ${n} ingresos`}
                />
                <span className="text-[10px] text-neutral-600">{h}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800">
        <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
          Ingresos por día y hora
        </h2>
        <div className="overflow-x-auto px-4 py-4">
          <table className="border-separate border-spacing-0 text-[10px]">
            <thead>
              <tr>
                <th className="pr-2 text-neutral-600"></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="w-5 text-center font-normal text-neutral-600">
                    {h % 3 === 0 ? h : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <tr key={dow}>
                  <td className="pr-2 text-right text-neutral-500">{DAYS[dow]}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const n = heatMap.get(`${dow}-${h}`) ?? 0;
                    const alpha = n === 0 ? 0.03 : 0.12 + (n / maxHeat) * 0.75;
                    return (
                      <td
                        key={h}
                        className="h-5 w-5 rounded-sm text-center align-middle text-neutral-800"
                        style={{ backgroundColor: `rgba(52, 211, 153, ${alpha.toFixed(2)})` }}
                        title={`${DAYS[dow]} ${h}:00 — ${n} ingresos`}
                      >
                        {n > 0 ? n : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Row title="Ingresos por día">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Día</Th>
            <Th right>Cobros</Th>
            <Th right>Recaudado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {daily.length === 0 && <Empty cols={3} />}
          {daily.map((d) => (
            <tr key={d.day}>
              <Td>{formatDate(d.day)}</Td>
              <Td right>{d.sessions}</Td>
              <Td right strong>{formatARS(d.collected)}</Td>
            </tr>
          ))}
        </tbody>
      </Row>
    </div>
  );
}

function Card({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "green" ? "text-emerald-400" : "text-neutral-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-neutral-800">
      <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">{title}</h2>
      <table className="w-full text-sm">
        {children}
      </table>
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>
  );
}

function Td({
  children,
  right,
  strong,
  mono,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 ${
        right ? "text-right tabular-nums" : ""
      } ${strong ? "font-medium text-neutral-100" : "text-neutral-300"} ${mono ? "font-mono text-xs" : ""}`}
    >
      {children}
    </td>
  );
}

function Empty({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-4 text-center text-neutral-500">
        Sin datos en el período.
      </td>
    </tr>
  );
}
