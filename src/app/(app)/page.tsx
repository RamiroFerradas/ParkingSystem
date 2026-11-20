import Link from "next/link";
import { Suspense } from "react";
import { query } from "@/lib/db/client";
import { formatARS } from "@/lib/format";
import { getBranchContext } from "@/lib/auth/context";
import { MiniBoxMap } from "@/components/boxes/mini-box-map";

/**
 * Dashboard con datos reales de la base local. Cada bloque dinámico va en
 * su propio boundary de Suspense (Cache Components).
 *
 * Mobile-first: una columna, dos tarjetas por fila y el estado de la cochera
 * arriba de todo. A partir de `sm` se abren tres columnas y en `lg` dos
 * paneles conviven lado a lado.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Dashboard</h1>
          <p className="text-xs text-neutral-500 sm:text-sm">
            Estado del estacionamiento en tiempo real
          </p>
        </div>
        <QuickActions />
      </header>

      <section aria-label="Ocupación de boxes" className="grid grid-cols-2 gap-3 sm:gap-4">
        <Suspense
          fallback={
            <>
              <SkeletonCard className="col-span-2 h-32" />
              <SkeletonCard /><SkeletonCard />
            </>
          }
        >
          <OccupancyCards />
        </Suspense>
      </section>

      <section aria-label="Mapa compacto de boxes" className="grid grid-cols-1 gap-3 sm:gap-4">
        <Suspense fallback={<SkeletonCard />}>
          <MiniBoxMapSection />
        </Suspense>
      </section>

      <section
        aria-label="Operación de hoy"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard className="col-span-2 sm:col-span-1" />
            </>
          }
        >
          <TodayCards />
        </Suspense>
      </section>

      <section
        aria-label="Comparativa con ayer"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard className="col-span-2 sm:col-span-1" />
            </>
          }
        >
          <YesterdayCards />
        </Suspense>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
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

async function ReportLink() {
  const context = await getBranchContext();
  if (!context?.can("reports.read")) return null;
  return (
    <Link
      href="/reportes"
      className="inline-flex min-h-10 items-center gap-1 rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
    >
      Ver reportes
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/** Atajos del día: las dos acciones que más se usan en el mostrador. */
async function QuickActions() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const canOpen = context.can("session.open");
  const canClose = context.can("session.close");
  if (!canOpen && !canClose) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canOpen && (
        <Link
          href="/operaciones/ingreso"
          className="inline-flex min-h-10 items-center rounded-md bg-amber-200 px-3 text-xs font-semibold text-neutral-950 hover:bg-amber-100"
        >
          Registrar ingreso
        </Link>
      )}
      {canClose && (
        <Link
          href="/operaciones/egreso"
          className="inline-flex min-h-10 items-center rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
        >
          Cobrar egreso
        </Link>
      )}
      <ReportLink />
    </div>
  );
}

async function MiniBoxMapSection() {
  // El mapa compacto muestra boxes, patentes y tickets: si el usuario tiene
  // negado `box.read`, no se renderiza (el menú ya oculta la sección).
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  if (!context.can("box.read")) return null;
  return <MiniBoxMap branchId={context.branchId} />;
}

/**
 * Estado de la cochera: es el dato que el dueño mira desde el teléfono. Va
 * como tarjeta ancha con la ocupación grande y la barra, no como tres números
 * sueltos que en 360px no se leen.
 */
async function OccupancyCards() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const rows = await query<{ occupied: string; available: string; out_of_service: string }>(
    `SELECT
       count(*) FILTER (WHERE status = 'occupied')      AS occupied,
       count(*) FILTER (WHERE status = 'available')     AS available,
       count(*) FILTER (WHERE status = 'out_of_service') AS out_of_service
     FROM box_status
     WHERE branch_id = $1`,
    [context.branchId],
  );
  const s = rows[0] ?? { occupied: "0", available: "0", out_of_service: "0" };
  const occupied = Number(s.occupied);
  const available = Number(s.available);
  const total = occupied + available + Number(s.out_of_service);
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;

  return (
    <>
      <div className="col-span-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-neutral-500">Ocupación ahora</p>
            <p
              className={
                "mt-1 text-4xl font-semibold tabular-nums sm:text-5xl " +
                (pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-emerald-400")
              }
            >
              {pct}%
            </p>
          </div>
          <p className="text-right text-xs text-neutral-500">
            <span className="block text-sm font-medium tabular-nums text-neutral-300">
              {occupied} / {total}
            </span>
            boxes ocupados
            {total === 0 ? " · sin boxes cargados" : ""}
          </p>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-800"
          role="img"
          aria-label={`${pct}% de ocupación: ${occupied} de ${total} boxes ocupados`}
        >
          <div
            className={
              "h-full rounded-full " +
              (pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500")
            }
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <StatCard label="Ocupados" value={String(occupied)} tone="red" />
      <StatCard label="Disponibles" value={String(available)} tone="green" />
    </>
  );
}

async function TodayCards() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const rows = await query<{
    ingresos: string;
    egresos: string;
    recaudado_cents: string;
  }>(
    `SELECT
       (SELECT count(*) FROM parking_sessions
         WHERE branch_id = $1
           AND (entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS ingresos,
       (SELECT count(*) FROM parking_sessions
         WHERE branch_id = $1
           AND status = 'closed'
           AND (exit_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS egresos,
       (SELECT COALESCE(SUM(p.amount_charged_cents), 0)
          FROM payments p
         WHERE p.branch_id = $1
           AND (p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS recaudado_cents`,
    [context.branchId],
  );
  const s = rows[0] ?? { ingresos: "0", egresos: "0", recaudado_cents: "0" };
  return (
    <>
      <StatCard label="Ingresos de hoy" value={String(s.ingresos)} tone="neutral" />
      <StatCard label="Egresos de hoy" value={String(s.egresos)} tone="neutral" />
      <StatCard
        label="Recaudado hoy"
        value={formatARS(Number(s.recaudado_cents))}
        tone="green"
        className="col-span-2 sm:col-span-1"
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
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const rows = await query<{
    ingresos_ayer: string;
    recaudado_hoy: string;
    recaudado_ayer: string;
  }>(
    `SELECT
       (SELECT count(*) FROM parking_sessions
         WHERE branch_id = $1
           AND (entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = ((now() - interval '1 day') AT TIME ZONE 'America/Argentina/Cordoba')::date) AS ingresos_ayer,
       (SELECT COALESCE(SUM(p.amount_charged_cents), 0)
          FROM payments p
         WHERE p.branch_id = $1
           AND (p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date) AS recaudado_hoy,
       (SELECT COALESCE(SUM(p.amount_charged_cents), 0)
          FROM payments p
         WHERE p.branch_id = $1
           AND (p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
             = ((now() - interval '1 day') AT TIME ZONE 'America/Argentina/Cordoba')::date) AS recaudado_ayer`,
    [context.branchId],
  );
  const s = rows[0] ?? { ingresos_ayer: "0", recaudado_hoy: "0", recaudado_ayer: "0" };
  const hoy = Number(s.recaudado_hoy);
  const ayer = Number(s.recaudado_ayer);
  const diff = ayer > 0 ? Math.round(((hoy - ayer) / ayer) * 100) : hoy > 0 ? 100 : 0;
  return (
    <>
      <StatCard label="Ingresos de ayer" value={String(s.ingresos_ayer)} tone="neutral" />
      <StatCard label="Recaudado ayer" value={formatARS(ayer)} tone="neutral" />
      <StatCard
        label="Hoy vs ayer"
        value={`${diff >= 0 ? "+" : ""}${diff}%`}
        tone={diff >= 0 ? "green" : "red"}
        className="col-span-2 sm:col-span-1"
      />
    </>
  );
}

async function MethodsToday() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const rows = await query<{ method_name: string; n: string; collected: string }>(
    `SELECT m.name AS method_name, count(*)::text AS n,
            COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
       FROM payments p
       JOIN payment_methods m ON m.id = p.method_id
      WHERE p.branch_id = $1
        AND (p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
          = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
      GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
    [context.branchId],
  );
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs font-medium text-neutral-500">Cobros de hoy por medio</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Sin cobros hoy todavía.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map((m) => (
            <li key={m.method_name} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-neutral-300">{m.method_name}</span>
              <span className="shrink-0 tabular-nums text-neutral-400">
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
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const rows = await query<{ n: string; errors: string }>(
    `SELECT
       count(*) FILTER (WHERE j.status = 'pending')::text AS n,
       count(*) FILTER (WHERE j.status = 'error')::text AS errors
       FROM print_jobs j
       JOIN parking_sessions s ON s.id = j.session_id
      WHERE s.branch_id = $1`,
    [context.branchId],
  );
  const s = rows[0] ?? { n: "0", errors: "0" };
  const total = Number(s.n) + Number(s.errors);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
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
  className = "",
}: {
  label: string;
  value: string;
  tone: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div
      className={
        "min-w-0 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5 " + className
      }
    >
      <p className="text-[11px] font-medium text-neutral-500 sm:text-xs">{label}</p>
      <p
        className={
          "mt-1.5 break-words text-xl font-semibold tabular-nums sm:mt-2 sm:text-2xl " +
          TONES[tone]
        }
      >
        {value}
      </p>
    </div>
  );
}

function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={"h-24 animate-pulse rounded-xl bg-neutral-900 " + className} />;
}
