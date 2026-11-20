import { Suspense } from "react";
import { query } from "@/lib/db/client";
import { formatARS } from "@/lib/format";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { MiniBoxMap } from "@/components/boxes/mini-box-map";

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

      <section aria-label="Mapa compacto de boxes" className="grid grid-cols-1 gap-4">
        <Suspense fallback={<SkeletonCard />}>
          <MiniBoxMapSection />
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

      <section aria-label="Comparativa con ayer" className="grid grid-cols-3 gap-4">
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          }
        >
          <YesterdayCards />
        </Suspense>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<SkeletonCard />}>
          <MethodsToday />
        </Suspense>
        <Suspense fallback={<SkeletonCard />}>
          <PendingPrints />
        </Suspense>
      </section>
    </div>
  );
}

async function MiniBoxMapSection() {
  // El mapa compacto muestra boxes, patentes y tickets: si el usuario tiene
  // negado `box.read`, no se renderiza (el menú ya oculta la sección).
  const user = await getSessionUser();
  if (!user) return null;
  if (!(await hasPermission(user, "box.read"))) return null;
  return <MiniBoxMap />;
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

const TONES: Record<string, string> = {
  red: "text-red-400",
  green: "text-emerald-400",
  neutral: "text-neutral-100",
};

async function YesterdayCards() {
  const rows = await query<{
    ingresos_ayer: string;
    recaudado_hoy: string;
    recaudado_ayer: string;
  }>(
    `SELECT
       (SELECT count(*) FROM parking_sessions
         WHERE (entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = ((now() - interval '1 day') AT TIME ZONE 'America/Argentina/Cordoba')::date) AS ingresos_ayer,
       (SELECT COALESCE(SUM(amount_charged_cents), 0) FROM payments
         WHERE (paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS recaudado_hoy,
       (SELECT COALESCE(SUM(amount_charged_cents), 0) FROM payments
         WHERE (paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = ((now() - interval '1 day') AT TIME ZONE 'America/Argentina/Cordoba')::date) AS recaudado_ayer`,
  );
  const s = rows[0] ?? { ingresos_ayer: "0", recaudado_hoy: "0", recaudado_ayer: "0" };
  const hoy = Number(s.recaudado_hoy);
  const ayer = Number(s.recaudado_ayer);
  const diff = ayer > 0 ? Math.round(((hoy - ayer) / ayer) * 100) : hoy > 0 ? 100 : 0;
  return (
    <>
      <StatCard label="Ingresos de ayer" value={String(s.ingresos_ayer)} tone="neutral" />
      <StatCard label="Recaudado ayer (ARS)" value={formatARS(ayer)} tone="neutral" />
      <StatCard
        label="Hoy vs ayer"
        value={`${diff >= 0 ? "+" : ""}${diff}%`}
        tone={diff >= 0 ? "green" : "red"}
      />
    </>
  );
}

async function MethodsToday() {
  const rows = await query<{ method_name: string; n: string; collected: string }>(
    `SELECT m.name AS method_name, count(*)::text AS n,
            COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
       FROM payments p JOIN payment_methods m ON m.id = p.method_id
      WHERE (p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
          = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
      GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
  );
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs font-medium text-neutral-500">Cobros de hoy por medio</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Sin cobros hoy todavía.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map((m) => (
            <li key={m.method_name} className="flex justify-between">
              <span className="text-neutral-300">{m.method_name}</span>
              <span className="tabular-nums text-neutral-400">
                {m.n} × {formatARS(Number(m.collected))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function PendingPrints() {
  const rows = await query<{ n: string; errors: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'pending')::text AS n,
       count(*) FILTER (WHERE status = 'error')::text AS errors
       FROM print_jobs`,
  );
  const s = rows[0] ?? { n: "0", errors: "0" };
  const total = Number(s.n) + Number(s.errors);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs font-medium text-neutral-500">Impresión pendiente</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${total > 0 ? "text-amber-400" : "text-neutral-100"}`}>
        {total}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {total > 0 ? "Reintentá desde Registrar ingreso." : "Todo impreso."}
      </p>
    </div>
  );
}

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
