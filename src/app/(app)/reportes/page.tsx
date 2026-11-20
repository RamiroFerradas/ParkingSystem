import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatARS, formatDate } from "@/lib/format";
import Link from "next/link";
import {
  DowBars,
  HBarList,
  StackedMonthBars,
  type StackedMonthPoint,
} from "@/components/charts/report-charts";

// La página consulta la DB en el servidor con datos que cambian por request.
// Se opta por ruta bloqueante (sin PPR).
export const instant = false;

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

/** Los últimos 12 meses (incluido el actual), en la zona del establecimiento. */
function lastTwelveMonths(): { month: string; label: string }[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (11 - index), 1));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const short = new Intl.DateTimeFormat("es-AR", {
      month: "short",
      timeZone: "UTC",
    })
      .format(date)
      .replace(".", "");
    return { month: `${y}-${m}`, label: `${short} ${String(y).slice(2)}` };
  });
}

interface AbonoImpactRow {
  active_count: string;
  recurring_cents: string;
  expiring_30: string;
  period_cents: string;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const context = await getBranchContext();
  if (!context) redirect("/login");
  if (!(await hasPermission(context.user, "reports.read"))) {
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
  if (!context.branchId) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
          <p className="text-sm font-medium text-neutral-200">Sin sucursal activa</p>
          <p className="mt-1 text-sm text-neutral-400">
            Elegí una sucursal para ver los reportes.
          </p>
          <Link
            href="/seleccionar-sucursal"
            className="mt-3 inline-block rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Seleccionar sucursal
          </Link>
        </div>
      </div>
    );
  }

  const branchId = context.branchId;
  const params = await searchParams;
  const period = PERIODS.find((p) => p.key === params.p) ?? PERIODS[3]!; // default 30 días
  const paid = period.where("p.paid_at");
  const entry = period.where("s.entry_at");
  const exit = period.where("s.exit_at");

  const [
    [totals, daily, byMethod, byVehicleType, byTariff, byEmployee, peakHours, heat, topBoxes],
    [monthlyByConcept, monthlyEntries, topPlates, dowRows, abonoImpact],
  ] = await Promise.all([
    Promise.all([
      query<{ sessions: string; collected: string; avg_cents: string; avg_minutes: string }>(
        `SELECT count(p.session_id)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected,
                COALESCE(round(avg(p.amount_charged_cents)
                  FILTER (WHERE p.session_id IS NOT NULL)), 0)::text AS avg_cents,
                COALESCE(round(avg(s.duration_minutes)
                  FILTER (WHERE s.id IS NOT NULL)), 0)::text AS avg_minutes
           FROM payments p
           LEFT JOIN parking_sessions s ON s.id = p.session_id
          WHERE p.branch_id = $1 AND ${paid}`,
        [branchId],
      ),
      query<{ day: string; sessions: string; collected: string }>(
        `SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date::text AS day,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY day ORDER BY day DESC`,
        [branchId],
      ),
      query<{ method_name: string; sessions: string; collected: string }>(
        `SELECT m.name AS method_name, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p JOIN payment_methods m ON m.id = p.method_id
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
        [branchId],
      ),
      query<{ vehicle_type: string; sessions: string; collected: string }>(
        `SELECT vt.name AS vehicle_type, count(*)::text AS sessions,
                COALESCE(sum(s.final_amount_cents), 0)::text AS collected
           FROM parking_sessions s JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
          WHERE s.branch_id = $1 AND s.status = 'closed' AND ${exit}
          GROUP BY vt.name ORDER BY sum(s.final_amount_cents) DESC`,
        [branchId],
      ),
      query<{ tariff_name: string; sessions: string; collected: string }>(
        `SELECT COALESCE(s.tariff_snapshot->'block'->>'name',
                         CASE WHEN p.concept = 'subscription' THEN 'Abono mensual' ELSE '—' END) AS tariff_name,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           LEFT JOIN parking_sessions s ON s.id = p.session_id
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY tariff_name ORDER BY sum(p.amount_charged_cents) DESC LIMIT 15`,
        [branchId],
      ),
      query<{ operator: string; sessions: string; collected: string }>(
        `SELECT COALESCE(pr.full_name, '—') AS operator, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN parking_sessions s ON s.id = p.session_id
           LEFT JOIN profiles pr ON pr.id = s.closed_by
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY operator ORDER BY sum(p.amount_charged_cents) DESC LIMIT 15`,
        [branchId],
      ),
      query<{ hour: number; count: string }>(
        `SELECT EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS hour,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1 AND ${entry}
          GROUP BY hour ORDER BY hour`,
        [branchId],
      ),
      query<{ dow: number; hour: number; count: string }>(
        `SELECT EXTRACT(DOW FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS dow,
                EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS hour,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1 AND ${entry}
          GROUP BY dow, hour`,
        [branchId],
      ),
      query<{ box_number: string; sessions: string; collected: string }>(
        `SELECT b.number AS box_number, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN parking_sessions s ON s.id = p.session_id
           JOIN parking_boxes b ON b.id = s.box_id
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY b.number ORDER BY sum(p.amount_charged_cents) DESC LIMIT 10`,
        [branchId],
      ),
    ]),
    Promise.all([
      query<{ month: string; sessions_cents: string; abono_cents: string; entries: string }>(
        `SELECT to_char(date_trunc('month', p.paid_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS month,
                COALESCE(sum(p.amount_charged_cents) FILTER (WHERE p.concept = 'session'), 0)::text AS sessions_cents,
                COALESCE(sum(p.amount_charged_cents) FILTER (WHERE p.concept = 'subscription'), 0)::text AS abono_cents,
                count(*)::text AS entries
           FROM payments p
          WHERE p.branch_id = $1
            AND p.paid_at >= (date_trunc('month', now() AT TIME ZONE '${TZ}') - interval '11 months') AT TIME ZONE '${TZ}'
          GROUP BY month ORDER BY month`,
        [branchId],
      ),
      query<{ month: string; count: string }>(
        `SELECT to_char(date_trunc('month', s.entry_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS month,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1
            AND s.entry_at >= (date_trunc('month', now() AT TIME ZONE '${TZ}') - interval '11 months') AT TIME ZONE '${TZ}'
          GROUP BY month ORDER BY month`,
        [branchId],
      ),
      query<{ plate: string; entries: string; billed: string }>(
        `SELECT v.plate, count(*)::text AS entries,
                COALESCE(sum(s.final_amount_cents), 0)::text AS billed
           FROM parking_sessions s
           JOIN vehicles v ON v.id = s.vehicle_id
          WHERE s.branch_id = $1 AND NOT v.plate_is_placeholder AND ${entry}
          GROUP BY v.plate ORDER BY count(*) DESC LIMIT 10`,
        [branchId],
      ),
      query<{ dow: number; count: string }>(
        `SELECT EXTRACT(DOW FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS dow,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1 AND ${entry}
          GROUP BY dow ORDER BY dow`,
        [branchId],
      ),
      query<AbonoImpactRow>(
        `WITH active_subs AS (
                SELECT amount_cents, ends_on
                  FROM subscriptions
                 WHERE branch_id = $1
                   AND status = 'active'
                   AND starts_on <= (now() AT TIME ZONE '${TZ}')::date
                   AND ends_on >= (now() AT TIME ZONE '${TZ}')::date
              )
              SELECT (SELECT count(*) FROM active_subs)::text AS active_count,
                     (SELECT COALESCE(sum(amount_cents), 0) FROM active_subs)::text AS recurring_cents,
                     (SELECT count(*) FROM active_subs
                       WHERE ends_on <= (now() AT TIME ZONE '${TZ}')::date + 30)::text AS expiring_30,
                     (SELECT COALESCE(sum(p.amount_charged_cents), 0)
                        FROM payments p
                       WHERE p.branch_id = $1 AND p.concept = 'subscription' AND ${period.where("p.paid_at")})::text AS period_cents`,
        [branchId],
      ),
    ]),
  ]);

  const t = totals[0] ?? { sessions: "0", collected: "0", avg_cents: "0", avg_minutes: "0" };
  const maxHour = Math.max(1, ...peakHours.map((h) => Number(h.count)));
  const maxHeat = Math.max(1, ...heat.map((c) => Number(c.count)));
  const heatMap = new Map(heat.map((c) => [`${c.dow}-${c.hour}`, Number(c.count)]));
  const hourMap = new Map(peakHours.map((h) => [h.hour, Number(h.count)]));

  const impact = abonoImpact[0] ?? {
    active_count: "0",
    recurring_cents: "0",
    expiring_30: "0",
    period_cents: "0",
  };
  const abonoShare =
    Number(t.collected) > 0 ? (Number(impact.period_cents) / Number(t.collected)) * 100 : 0;

  const payMap = new Map(monthlyByConcept.map((row) => [row.month, row]));
  const entryMap = new Map(monthlyEntries.map((row) => [row.month, Number(row.count)]));
  const monthSeries: StackedMonthPoint[] = lastTwelveMonths().map((bucket) => {
    const row = payMap.get(bucket.month);
    return {
      month: bucket.month,
      label: bucket.label,
      sessionsCents: Number(row?.sessions_cents ?? 0),
      abonoCents: Number(row?.abono_cents ?? 0),
      entries: Number(row?.entries ?? 0),
    };
  });

  const dowData = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    count: Number(dowRows.find((row) => row.dow === dow)?.count ?? 0),
  }));

  const plateItems = topPlates.map((row) => ({
    label: row.plate,
    value: Number(row.entries),
    detail: formatARS(row.billed),
  }));

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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-300">Impacto de abonos</h2>
          <Link
            href="/reportes/abonados"
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Ver detalle de abonados →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Abonados activos" value={impact.active_count} />
          <Card label="Ingreso recurrente mensual" value={formatARS(impact.recurring_cents)} tone="green" />
          <Card label="Cobrado por abonos (período)" value={formatARS(impact.period_cents)} tone="green" />
          <Card
            label="% de la facturación"
            value={`${abonoShare.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
          />
        </div>
      </section>

      <ChartPanel
        title="Facturación por mes (últimos 12)"
        hint="Estadías y abonos, según fecha de cobro."
      >
        <StackedMonthBars data={monthSeries} />
      </ChartPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Autos que más acceden" hint={`Ranking del período: ${period.label.toLowerCase()}.`}>
          <HBarList items={plateItems} unit="accesos" unitSingular="acceso" />
        </ChartPanel>
        <ChartPanel title="Movimientos por día de la semana" hint={`Ingresos del período: ${period.label.toLowerCase()}.`}>
          <DowBars data={dowData} />
        </ChartPanel>
      </div>

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
                  className="w-full rounded-t bg-amber-500/70"
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

function ChartPanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-800">
      <div className="bg-neutral-900 px-4 py-2">
        <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
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
