import { getBranchContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatARS, formatDate } from "@/lib/format";
import Link from "next/link";
import { DowBars, HBarList, StackedMonthBars } from "@/components/charts/report-charts";
import { PERIODS, resolvePeriod } from "@/lib/reports/period";
import { loadReportOverview } from "@/lib/queries/reports/overview";
import { AccessDenied } from "@/components/ui/access-denied";
import { Card, Empty, TableSection, Td, Th } from "@/components/ui/report-table";

// La página consulta la DB en el servidor con datos que cambian por request.
// Se opta por ruta bloqueante (sin PPR).
export const instant = false;

const DAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

const RELATED_REPORTS = [
  { href: "/reportes/boxes", label: "Ranking de boxes" },
  { href: "/reportes/abonados", label: "Abonados" },
  { href: "/reportes/turnos", label: "Turnos" },
];

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const context = await getBranchContext();
  if (!context) redirect("/login");
  if (!(await hasPermission(context.user, "reports.read"))) {
    return <AccessDenied message="Requiere permiso de reportes (supervisor o administrador)." />;
  }
  if (!context.branchId) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
          <p className="text-sm font-medium text-neutral-200">Sin sucursal activa</p>
          <p className="mt-1 text-sm text-neutral-400">Elegí una sucursal para ver los reportes.</p>
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

  const params = await searchParams;
  const period = resolvePeriod(params.p);
  const overview = await loadReportOverview(context.branchId, period);
  const { totals: t, impact, abonoShare, monthSeries, dowData, maxHour, maxHeat } = overview;
  const { daily, byMethod, byVehicleType, byTariff, byEmployee, topBoxes, topPlates } = overview;
  const { hourMap, heatMap } = overview;

  const plateItems = topPlates.map((row) => ({
    label: row.plate,
    value: Number(row.entries),
    detail: formatARS(row.billed),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Reportes</h1>
            <p className="text-xs text-neutral-500 sm:text-sm">
              Facturación y estadísticas · período: {period.label.toLowerCase()}.
            </p>
          </div>
          <a
            href={`/api/reports/export?p=${period.key}`}
            className="inline-flex min-h-10 items-center rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
          >
            Exportar CSV
          </a>
        </div>
        <nav className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/reportes?p=${p.key}`}
              className={
                "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs " +
                (p.key === period.key
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800")
              }
            >
              {p.label}
            </Link>
          ))}
          {RELATED_REPORTS.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-neutral-700 px-3 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              {report.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Card label="Recaudación" value={formatARS(t.collected)} tone="green" size="responsive" />
        <Card label="Cobros" value={t.sessions} size="responsive" />
        <Card label="Ticket promedio" value={formatARS(t.avg_cents)} size="responsive" />
        <Card label="Duración promedio" value={`${Number(t.avg_minutes)} min`} size="responsive" />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-300">Impacto de abonos</h2>
          <Link
            href="/reportes/abonados"
            className="inline-flex min-h-9 items-center rounded-md border border-neutral-700 px-2.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Ver detalle de abonados →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          <Card label="Abonados activos" value={impact.active_count} size="responsive" />
          <Card label="Ingreso recurrente mensual" value={formatARS(impact.recurring_cents)} tone="green" size="responsive" />
          <Card label="Cobrado por abonos (período)" value={formatARS(impact.period_cents)} tone="green" size="responsive" />
          <Card
            label="% de la facturación"
            value={`${abonoShare.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
            size="responsive"
          />
        </div>
      </section>

      <ChartPanel title="Facturación por mes (últimos 12)" hint="Estadías y abonos, según fecha de cobro.">
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

      <Breakdown
        title="Recaudación por medio de pago"
        heads={["Medio", "Cobros", "Total"]}
        rows={byMethod.map((m) => ({ key: m.method_name, cells: [m.method_name, m.sessions, formatARS(m.collected)] }))}
      />

      <Breakdown
        title="Por tipo de vehículo"
        heads={["Tipo", "Estadías", "Facturado"]}
        rows={byVehicleType.map((v) => ({ key: v.vehicle_type, cells: [v.vehicle_type, v.sessions, formatARS(v.collected)] }))}
      />

      <Breakdown
        title="Por tarifa aplicada (snapshot)"
        heads={["Tarifa", "Cobros", "Total"]}
        rows={byTariff.map((x) => ({ key: x.tariff_name, cells: [x.tariff_name, x.sessions, formatARS(x.collected)] }))}
      />

      <Breakdown
        title="Por empleado que cerró el cobro"
        heads={["Empleado", "Cobros", "Total"]}
        rows={byEmployee.map((x) => ({ key: x.operator, cells: [x.operator, x.sessions, formatARS(x.collected)] }))}
      />

      <Breakdown
        title="Ranking de boxes por facturación"
        heads={["Box", "Cobros", "Facturado"]}
        rows={topBoxes.map((b) => ({ key: b.box_number, cells: [b.box_number, b.sessions, formatARS(b.collected)] }))}
        monoFirst
      />

      <section className="rounded-xl border border-neutral-800">
        <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
          Horas pico de ingresos
        </h2>
        <div className="scroll-x px-3 py-4 sm:px-4">
          <div className="flex min-w-[460px] items-end gap-1">
            {Array.from({ length: 24 }, (_, h) => {
              const n = hourMap.get(h) ?? 0;
              const height = n === 0 ? 2 : Math.max(4, Math.round((n / maxHour) * 100));
              return (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-amber-500/70" style={{ height: `${height}px` }} title={`${h}:00 — ${n} ingresos`} />
                  <span className="text-[10px] tabular-nums text-neutral-600">{h % 3 === 0 ? h : ""}</span>
                </div>
              );
            })}
          </div>
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
                  <th key={h} className="w-5 text-center font-normal text-neutral-600">{h % 3 === 0 ? h : ""}</th>
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

      <Breakdown
        title="Ingresos por día"
        heads={["Día", "Cobros", "Recaudado"]}
        rows={daily.map((d) => ({ key: d.day, cells: [formatDate(d.day), d.sessions, formatARS(d.collected)] }))}
      />
    </div>
  );
}

/** Fila del tablero: primera celda, cifra y plata. */
interface BreakdownRow {
  key: string;
  cells: React.ReactNode[];
}

function Breakdown({
  title,
  heads,
  rows,
  monoFirst,
}: {
  title: string;
  heads: string[];
  rows: BreakdownRow[];
  monoFirst?: boolean;
}) {
  return (
    <TableSection title={title} scroll="app" sticky tableClassName="min-w-[380px]">
      <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
        <tr>
          <Th padding="default">{heads[0]}</Th>
          <Th right padding="default">{heads[1]}</Th>
          <Th right padding="default">{heads[2]}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800 bg-neutral-950">
        {rows.length === 0 && <Empty cols={3} />}
        {rows.map((row) => (
          <tr key={row.key}>
            <Td mono={monoFirst} padding="default">{row.cells[0]}</Td>
            <Td right padding="default">{row.cells[1]}</Td>
            <Td right strong padding="default">{row.cells[2]}</Td>
          </tr>
        ))}
      </tbody>
    </TableSection>
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
      <div className="px-3 py-3 sm:px-4 sm:py-4">{children}</div>
    </section>
  );
}
