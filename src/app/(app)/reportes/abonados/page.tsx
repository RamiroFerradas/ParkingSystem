import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatARS } from "@/lib/format";
import Link from "next/link";
import { StackedMonthBars, type StackedMonthPoint } from "@/components/charts/report-charts";
import { lastTwelveMonths } from "@/lib/reports/months";
import { TZ } from "@/lib/reports/period";
import { AccessDenied } from "@/components/ui/access-denied";
import { Card, Empty, TableSection, Td, Th } from "@/components/ui/report-table";

// La página consulta la DB en el servidor con datos que cambian por request.
export const instant = false;

const EXPIRING_DAYS = 30;

interface SubscriptionRow {
  plate: string;
  vehicle_type: string;
  plan: string;
  starts_on: string;
  ends_on: string;
  amount_cents: string;
  days_left: number;
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` sin pasar por Date (evita corrimientos de TZ). */
function showDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export default async function AbonadosReportPage() {
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
          <p className="mt-1 text-sm text-neutral-400">
            Elegí una sucursal para ver los abonados.
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

  const [subscriptions, monthly] = await Promise.all([
    query<SubscriptionRow>(
      `SELECT v.plate,
              vt.name AS vehicle_type,
              t.name AS plan,
              s.starts_on::text AS starts_on,
              s.ends_on::text AS ends_on,
              s.amount_cents::text AS amount_cents,
              (s.ends_on - (now() AT TIME ZONE '${TZ}')::date) AS days_left
         FROM subscriptions s
         JOIN vehicles v ON v.id = s.vehicle_id
         JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
         JOIN parking_tariffs t ON t.id = s.tariff_id
        WHERE s.branch_id = $1
          AND s.status = 'active'
          AND s.starts_on <= (now() AT TIME ZONE '${TZ}')::date
          AND s.ends_on >= (now() AT TIME ZONE '${TZ}')::date
          AND NOT v.plate_is_placeholder
        ORDER BY s.ends_on, v.plate`,
      [branchId],
    ),
    query<{ month: string; abono_cents: string }>(
      `SELECT to_char(date_trunc('month', p.paid_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS month,
              COALESCE(sum(p.amount_charged_cents), 0)::text AS abono_cents
         FROM payments p
        WHERE p.branch_id = $1
          AND p.concept = 'subscription'
          AND p.paid_at >= (date_trunc('month', now() AT TIME ZONE '${TZ}') - interval '11 months') AT TIME ZONE '${TZ}'
        GROUP BY month ORDER BY month`,
      [branchId],
    ),
  ]);

  const revenueMap = new Map(monthly.map((row) => [row.month, Number(row.abono_cents)]));
  const monthSeries: StackedMonthPoint[] = lastTwelveMonths().map((bucket) => ({
    month: bucket.month,
    label: bucket.label,
    sessionsCents: 0,
    abonoCents: revenueMap.get(bucket.month) ?? 0,
    entries: 0,
  }));

  const activeCount = subscriptions.length;
  const recurringCents = subscriptions.reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const collectedCents = monthSeries.reduce((sum, row) => sum + row.abonoCents, 0);
  const expiring = subscriptions.filter((row) => row.days_left <= EXPIRING_DAYS);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Impacto de abonos</h1>
          <p className="text-sm text-neutral-500">
            Abonados vigentes, ingreso recurrente y cobros de los últimos 12 meses.
          </p>
        </div>
        <Link
          href="/reportes"
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          ← Volver a reportes
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Card label="Activos hoy" value={String(activeCount)} size="lg" />
        <Card
          label="Ingreso recurrente mensual"
          value={formatARS(recurringCents)}
          tone="green"
          size="lg"
        />
        <Card
          label="Cobrado por abonos (12 meses)"
          value={formatARS(collectedCents)}
          tone="green"
          size="lg"
        />
        <Card
          label={`Vencen en ${EXPIRING_DAYS} días`}
          value={String(expiring.length)}
          tone="amber"
          size="lg"
        />
      </section>

      <section className="rounded-xl border border-neutral-800">
        <div className="bg-neutral-900 px-4 py-2">
          <h2 className="text-sm font-medium text-neutral-300">Cobrado por abonos, por mes</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Últimos 12 meses, según fecha de cobro.
          </p>
        </div>
        <div className="px-4 py-4">
          <StackedMonthBars
            data={monthSeries}
            emptyLabel="Sin cobros por abonos en los últimos 12 meses."
          />
        </div>
      </section>

      <TableSection title="Abonados vigentes">
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th padding="wide">Patente</Th>
            <Th padding="wide">Tipo</Th>
            <Th padding="wide">Plan</Th>
            <Th padding="wide">Desde</Th>
            <Th padding="wide">Hasta</Th>
            <Th right padding="wide">Monto</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {subscriptions.length === 0 && <Empty cols={6}>Sin abonados vigentes.</Empty>}
          {subscriptions.map((row) => (
            <tr key={`${row.plate}-${row.starts_on}`}>
              <Td mono padding="wide">{row.plate}</Td>
              <Td padding="wide">{row.vehicle_type}</Td>
              <Td padding="wide">{row.plan}</Td>
              <Td padding="wide">{showDate(row.starts_on)}</Td>
              <Td padding="wide">{showDate(row.ends_on)}</Td>
              <Td right strong padding="wide">{formatARS(row.amount_cents)}</Td>
            </tr>
          ))}
        </tbody>
      </TableSection>

      <TableSection title={`Próximos vencimientos (${EXPIRING_DAYS} días)`}>
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th padding="wide">Patente</Th>
            <Th padding="wide">Plan</Th>
            <Th padding="wide">Hasta</Th>
            <Th right padding="wide">Monto</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {expiring.length === 0 && (
            <Empty cols={4}>Sin vencimientos en los próximos {EXPIRING_DAYS} días.</Empty>
          )}
          {expiring.map((row) => (
            <tr key={`${row.plate}-${row.ends_on}`}>
              <Td mono padding="wide">{row.plate}</Td>
              <Td padding="wide">{row.plan}</Td>
              <Td padding="wide">{showDate(row.ends_on)}</Td>
              <Td right strong padding="wide">{formatARS(row.amount_cents)}</Td>
            </tr>
          ))}
        </tbody>
      </TableSection>

      <p className="text-xs text-neutral-500">
        Gestioná altas y renovaciones desde{" "}
        <Link href="/tarifas/abonados" className="text-neutral-300 underline hover:text-neutral-100">
          Abonados mensuales
        </Link>
        .
      </p>
    </div>
  );
}
