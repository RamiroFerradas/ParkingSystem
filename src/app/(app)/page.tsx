import { Suspense } from "react";
import { query } from "@/lib/db/client";

/**
 * Dashboard con datos reales de la base local. Cada bloque dinámico va en
 * su propio boundary de Suspense (Cache Components).
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Estado del estacionamiento en tiempo real
        </p>
      </header>

      <section
        aria-label="Ocupación de boxes"
        className="grid grid-cols-3 gap-4"
      >
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          }
        >
          <OccupancyCards />
        </Suspense>
      </section>

      <section aria-label="Operación de hoy" className="grid grid-cols-3 gap-4">
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          }
        >
          <TodayCards />
        </Suspense>
      </section>
    </div>
  );
}

async function OccupancyCards() {
  const rows = await query<{ occupied: string; available: string; out_of_service: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'occupied')      AS occupied,
       count(*) FILTER (WHERE status = 'available')     AS available,
       count(*) FILTER (WHERE status = 'out_of_service') AS out_of_service
     FROM box_status`,
  );
  const s = rows[0] ?? { occupied: "0", available: "0", out_of_service: "0" };
  const total = Number(s.occupied) + Number(s.available) + Number(s.out_of_service);
  const pct = total > 0 ? Math.round((Number(s.occupied) / total) * 100) : 0;
  return (
    <>
      <StatCard label="Boxes ocupados" value={String(s.occupied)} tone="red" />
      <StatCard label="Boxes disponibles" value={String(s.available)} tone="green" />
      <StatCard label="Ocupación" value={`${pct}%`} tone="neutral" />
    </>
  );
}

async function TodayCards() {
  const rows = await query<{
    ingresos: string;
    egresos: string;
    recaudado_cents: string;
  }>(
    `SELECT
       (SELECT count(*) FROM parking_sessions
         WHERE (entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS ingresos,
       (SELECT count(*) FROM parking_sessions
         WHERE status = 'closed'
           AND (exit_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS egresos,
       (SELECT COALESCE(SUM(amount_charged_cents), 0) FROM payments
         WHERE (paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS recaudado_cents`,
  );
  const s = rows[0] ?? { ingresos: "0", egresos: "0", recaudado_cents: "0" };
  return (
    <>
      <StatCard label="Ingresos de hoy" value={String(s.ingresos)} tone="neutral" />
      <StatCard label="Egresos de hoy" value={String(s.egresos)} tone="neutral" />
      <StatCard
        label="Recaudado hoy (ARS)"
        value={formatARS(Number(s.recaudado_cents))}
        tone="green"
      />
    </>
  );
}

function formatARS(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const TONES: Record<string, string> = {
  red: "text-red-400",
  green: "text-emerald-400",
  neutral: "text-neutral-100",
};

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${TONES[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-xl bg-neutral-900" />;
}
