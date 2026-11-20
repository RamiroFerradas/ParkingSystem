import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatARS } from "@/lib/format";
import Link from "next/link";
import {
  StackedMonthBars,
  type StackedMonthPoint,
} from "@/components/charts/report-charts";

// La página consulta la DB en el servidor con datos que cambian por request.
export const instant = false;

const TZ = "America/Argentina/Cordoba";
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

export default async function AbonadosReportPage() {
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Impacto de abonos</h1>
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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Activos hoy" value={String(activeCount)} />
        <Card label="Ingreso recurrente mensual" value={formatARS(recurringCents)} tone="green" />
        <Card label="Cobrado por abonos (12 meses)" value={formatARS(collectedCents)} tone="green" />
        <Card label={`Vencen en ${EXPIRING_DAYS} días`} value={String(expiring.length)} tone="amber" />
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
            <Th>Patente</Th>
            <Th>Tipo</Th>
            <Th>Plan</Th>
            <Th>Desde</Th>
            <Th>Hasta</Th>
            <Th right>Monto</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {subscriptions.length === 0 && <Empty cols={6}>Sin abonados vigentes.</Empty>}
          {subscriptions.map((row) => (
            <tr key={`${row.plate}-${row.starts_on}`}>
              <Td mono>{row.plate}</Td>
              <Td>{row.vehicle_type}</Td>
              <Td>{row.plan}</Td>
              <Td>{showDate(row.starts_on)}</Td>
              <Td>{showDate(row.ends_on)}</Td>
              <Td right strong>{formatARS(row.amount_cents)}</Td>
            </tr>
          ))}
        </tbody>
      </TableSection>

      <TableSection title={`Próximos vencimientos (${EXPIRING_DAYS} días)`}>
        <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
          <tr>
            <Th>Patente</Th>
            <Th>Plan</Th>
            <Th>Hasta</Th>
            <Th right>Monto</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {expiring.length === 0 && (
            <Empty cols={4}>Sin vencimientos en los próximos {EXPIRING_DAYS} días.</Empty>
          )}
          {expiring.map((row) => (
            <tr key={`${row.plate}-${row.ends_on}`}>
              <Td mono>{row.plate}</Td>
              <Td>{row.plan}</Td>
              <Td>{showDate(row.ends_on)}</Td>
              <Td right strong>{formatARS(row.amount_cents)}</Td>
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

function Card({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : "text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function TableSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-neutral-800">
      <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">{title}</h2>
      <table className="w-full text-sm">{children}</table>
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
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
      className={`px-4 py-2.5 ${right ? "text-right tabular-nums" : ""} ${
        strong ? "font-medium text-neutral-100" : "text-neutral-300"
      } ${mono ? "font-mono text-xs" : ""}`}
    >
      {children}
    </td>
  );
}

function Empty({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-4 text-center text-neutral-500">
        {children}
      </td>
    </tr>
  );
}
