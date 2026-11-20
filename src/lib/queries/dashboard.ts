import { query } from "@/lib/db/client";

/**
 * Consultas del dashboard. Cada loader devuelve un objeto explícito con los
 * valores ya normalizados: el SQL castea a `::text` y las tarjetas formatean
 * con los helpers de `@/lib/format`, así que los números se convierten una
 * sola vez acá y no dentro del JSX.
 *
 * Los bloques SQL son los mismos que vivían en `app/(app)/page.tsx`: mismos
 * filtros, mismos parámetros y mismo orden.
 */

/** Abonos: vigentes hoy, facturación recurrente del mes y vencimientos a 30 días. */
export interface SubscriptionImpact {
  active: number;
  /** Suma de `amount_cents` de los abonos vigentes (en centavos). */
  recurringCents: number;
  expiring: number;
}

interface SubscriptionImpactRow {
  active: string;
  recurring: string;
  expiring: string;
}

export async function loadSubscriptionImpact(branchId: string): Promise<SubscriptionImpact> {
  const rows = await query<SubscriptionImpactRow>(
    `SELECT count(*) FILTER (
              WHERE starts_on <= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                AND ends_on >= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
            )::text AS active,
            COALESCE(sum(amount_cents) FILTER (
              WHERE starts_on <= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                AND ends_on >= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
            ), 0)::text AS recurring,
            count(*) FILTER (
              WHERE ends_on BETWEEN (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                                AND (now() AT TIME ZONE 'America/Argentina/Cordoba')::date + 30
            )::text AS expiring
       FROM subscriptions
      WHERE branch_id = $1 AND status = 'active'`,
    [branchId],
  );
  const s = rows[0] ?? { active: "0", recurring: "0", expiring: "0" };
  return {
    active: Number(s.active),
    recurringCents: Number(s.recurring),
    expiring: Number(s.expiring),
  };
}

/** Ocupación de la cochera con el porcentaje ya calculado sobre el total de boxes. */
export interface BoxOccupancy {
  occupied: number;
  available: number;
  outOfService: number;
  total: number;
  /** Entero 0-100. */
  pct: number;
}

interface BoxOccupancyRow {
  occupied: string;
  available: string;
  out_of_service: string;
}

export async function loadBoxOccupancy(branchId: string): Promise<BoxOccupancy> {
  const rows = await query<BoxOccupancyRow>(
    `SELECT
       count(*) FILTER (WHERE status = 'occupied')      AS occupied,
       count(*) FILTER (WHERE status = 'available')     AS available,
       count(*) FILTER (WHERE status = 'out_of_service') AS out_of_service
     FROM box_status
     WHERE branch_id = $1`,
    [branchId],
  );
  const s = rows[0] ?? { occupied: "0", available: "0", out_of_service: "0" };
  const occupied = Number(s.occupied);
  const available = Number(s.available);
  const total = occupied + available + Number(s.out_of_service);
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return { occupied, available, outOfService: Number(s.out_of_service), total, pct };
}

/** Operación del día: ingresos, egresos y recaudado (en centavos). */
export interface TodayOperations {
  entries: number;
  exits: number;
  collectedCents: number;
}

interface TodayOperationsRow {
  ingresos: string;
  egresos: string;
  recaudado_cents: string;
}

export async function loadTodayOperations(branchId: string): Promise<TodayOperations> {
  const rows = await query<TodayOperationsRow>(
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
    [branchId],
  );
  const s = rows[0] ?? { ingresos: "0", egresos: "0", recaudado_cents: "0" };
  return {
    entries: Number(s.ingresos),
    exits: Number(s.egresos),
    collectedCents: Number(s.recaudado_cents),
  };
}

/** Comparativa con ayer: recaudado de ambos días y la variación porcentual. */
export interface YesterdayComparison {
  entriesYesterday: number;
  collectedTodayCents: number;
  collectedYesterdayCents: number;
  /** Variación contra ayer en puntos enteros; 100 cuando ayer no hubo cobros. */
  diffPct: number;
}

interface YesterdayComparisonRow {
  ingresos_ayer: string;
  recaudado_hoy: string;
  recaudado_ayer: string;
}

export async function loadYesterdayComparison(branchId: string): Promise<YesterdayComparison> {
  const rows = await query<YesterdayComparisonRow>(
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
    [branchId],
  );
  const s = rows[0] ?? { ingresos_ayer: "0", recaudado_hoy: "0", recaudado_ayer: "0" };
  const hoy = Number(s.recaudado_hoy);
  const ayer = Number(s.recaudado_ayer);
  const diff = ayer > 0 ? Math.round(((hoy - ayer) / ayer) * 100) : hoy > 0 ? 100 : 0;
  return {
    entriesYesterday: Number(s.ingresos_ayer),
    collectedTodayCents: hoy,
    collectedYesterdayCents: ayer,
    diffPct: diff,
  };
}

/** Cobros del día agrupados por medio de pago, de mayor a menor recaudación. */
export interface PaymentMethodTotal {
  methodName: string;
  count: number;
  collectedCents: number;
}

interface PaymentMethodTotalRow {
  method_name: string;
  n: string;
  collected: string;
}

export async function loadPaymentMethodsToday(branchId: string): Promise<PaymentMethodTotal[]> {
  const rows = await query<PaymentMethodTotalRow>(
    `SELECT m.name AS method_name, count(*)::text AS n,
            COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
       FROM payments p
       JOIN payment_methods m ON m.id = p.method_id
      WHERE p.branch_id = $1
        AND (p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date
          = (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
      GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
    [branchId],
  );
  return rows.map((row) => ({
    methodName: row.method_name,
    count: Number(row.n),
    collectedCents: Number(row.collected),
  }));
}

/** Trabajos de impresión pendientes y con error de la sucursal. */
export interface PendingPrintJobs {
  pending: number;
  errors: number;
  total: number;
}

interface PendingPrintJobsRow {
  n: string;
  errors: string;
}

export async function loadPendingPrintJobs(branchId: string): Promise<PendingPrintJobs> {
  const rows = await query<PendingPrintJobsRow>(
    `SELECT
       count(*) FILTER (WHERE j.status = 'pending')::text AS n,
       count(*) FILTER (WHERE j.status = 'error')::text AS errors
       FROM print_jobs j
       JOIN parking_sessions s ON s.id = j.session_id
      WHERE s.branch_id = $1`,
    [branchId],
  );
  const s = rows[0] ?? { n: "0", errors: "0" };
  const pending = Number(s.n);
  const errors = Number(s.errors);
  return { pending, errors, total: pending + errors };
}
