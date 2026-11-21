import { query } from "@/lib/db/client";
import { lastTwelveMonths } from "@/lib/reports/months";
import { TZ, type Period } from "@/lib/reports/period";
import type { StackedMonthPoint } from "@/components/charts/report-charts";

export interface ReportTotalsRow {
  sessions: string;
  collected: string;
  avg_cents: string;
  avg_minutes: string;
}

export interface DailyRow {
  day: string;
  sessions: string;
  collected: string;
}
export interface MethodTotalRow {
  method_name: string;
  sessions: string;
  collected: string;
}
export interface VehicleTypeRow {
  vehicle_type: string;
  sessions: string;
  collected: string;
}
export interface TariffRow {
  tariff_name: string;
  sessions: string;
  collected: string;
}
export interface EmployeeRow {
  operator: string;
  sessions: string;
  collected: string;
}
export interface PeakHourRow {
  hour: number;
  count: string;
}
export interface HeatCellRow {
  dow: number;
  hour: number;
  count: string;
}
export interface BoxTotalRow {
  box_number: string;
  sessions: string;
  collected: string;
}
export interface MonthlyConceptRow {
  month: string;
  sessions_cents: string;
  abono_cents: string;
  entries: string;
}
export interface MonthlyEntryRow {
  month: string;
  count: string;
}
export interface TopPlateRow {
  plate: string;
  entries: string;
  billed: string;
}
export interface DowRow {
  dow: number;
  count: string;
}

export interface AbonoImpactRow {
  active_count: string;
  recurring_cents: string;
  expiring_30: string;
  period_cents: string;
}

export interface DowPoint {
  dow: number;
  count: number;
}

/** Todo lo que renderiza el tablero de `/reportes`, ya resuelto y derivado. */
export interface ReportOverview {
  totals: ReportTotalsRow;
  daily: DailyRow[];
  byMethod: MethodTotalRow[];
  byVehicleType: VehicleTypeRow[];
  byTariff: TariffRow[];
  byEmployee: EmployeeRow[];
  topBoxes: BoxTotalRow[];
  /** Ingresos de estadías por mes (12 meses). */
  monthlyEntries: MonthlyEntryRow[];
  topPlates: TopPlateRow[];
  impact: AbonoImpactRow;
  /** Porcentaje de la facturación del período cobrado por abonos. */
  abonoShare: number;
  monthSeries: StackedMonthPoint[];
  dowData: DowPoint[];
  /** Ingresos por hora (0-23). */
  hourMap: Map<number, number>;
  maxHour: number;
  /** Ingresos por día de la semana y hora, con clave `${dow}-${hour}`. */
  heatMap: Map<string, number>;
  maxHeat: number;
}

/** Las 14 consultas del tablero de reportes, en una sola pasada. */
export async function loadReportOverview(
  branchId: string,
  period: Period,
): Promise<ReportOverview> {
  const paid = period.where("p.paid_at");
  const entry = period.where("s.entry_at");
  const exit = period.where("s.exit_at");

  const [
    [totals, daily, byMethod, byVehicleType, byTariff, byEmployee, peakHours, heat, topBoxes],
    [monthlyByConcept, monthlyEntries, topPlates, dowRows, abonoImpact],
  ] = await Promise.all([
    Promise.all([
      query<ReportTotalsRow>(
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
      query<DailyRow>(
        `SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date::text AS day,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY day ORDER BY day DESC`,
        [branchId],
      ),
      query<MethodTotalRow>(
        `SELECT m.name AS method_name, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p JOIN payment_methods m ON m.id = p.method_id
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
        [branchId],
      ),
      query<VehicleTypeRow>(
        `SELECT vt.name AS vehicle_type, count(*)::text AS sessions,
                COALESCE(sum(s.final_amount_cents), 0)::text AS collected
           FROM parking_sessions s JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
          WHERE s.branch_id = $1 AND s.status = 'closed' AND ${exit}
          GROUP BY vt.name ORDER BY sum(s.final_amount_cents) DESC`,
        [branchId],
      ),
      query<TariffRow>(
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
      query<EmployeeRow>(
        `SELECT COALESCE(pr.email, '—') AS operator, count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN parking_sessions s ON s.id = p.session_id
           LEFT JOIN profiles pr ON pr.id = s.closed_by
          WHERE p.branch_id = $1 AND ${paid}
          GROUP BY operator ORDER BY sum(p.amount_charged_cents) DESC LIMIT 15`,
        [branchId],
      ),
      query<PeakHourRow>(
        `SELECT EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS hour,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1 AND ${entry}
          GROUP BY hour ORDER BY hour`,
        [branchId],
      ),
      query<HeatCellRow>(
        `SELECT EXTRACT(DOW FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS dow,
                EXTRACT(HOUR FROM (s.entry_at AT TIME ZONE '${TZ}'))::int AS hour,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1 AND ${entry}
          GROUP BY dow, hour`,
        [branchId],
      ),
      query<BoxTotalRow>(
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
      query<MonthlyConceptRow>(
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
      query<MonthlyEntryRow>(
        `SELECT to_char(date_trunc('month', s.entry_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS month,
                count(*)::text AS count
           FROM parking_sessions s
          WHERE s.branch_id = $1
            AND s.entry_at >= (date_trunc('month', now() AT TIME ZONE '${TZ}') - interval '11 months') AT TIME ZONE '${TZ}'
          GROUP BY month ORDER BY month`,
        [branchId],
      ),
      query<TopPlateRow>(
        `SELECT v.plate, count(*)::text AS entries,
                COALESCE(sum(s.final_amount_cents), 0)::text AS billed
           FROM parking_sessions s
           JOIN vehicles v ON v.id = s.vehicle_id
          WHERE s.branch_id = $1 AND NOT v.plate_is_placeholder AND ${entry}
          GROUP BY v.plate ORDER BY count(*) DESC LIMIT 10`,
        [branchId],
      ),
      query<DowRow>(
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
                       WHERE p.branch_id = $1 AND p.concept = 'subscription' AND ${paid})::text AS period_cents`,
        [branchId],
      ),
    ]),
  ]);

  const t = totals[0] ?? { sessions: "0", collected: "0", avg_cents: "0", avg_minutes: "0" };

  const impact = abonoImpact[0] ?? {
    active_count: "0",
    recurring_cents: "0",
    expiring_30: "0",
    period_cents: "0",
  };
  const abonoShare =
    Number(t.collected) > 0 ? (Number(impact.period_cents) / Number(t.collected)) * 100 : 0;

  const maxHour = Math.max(1, ...peakHours.map((h) => Number(h.count)));
  const maxHeat = Math.max(1, ...heat.map((c) => Number(c.count)));
  const heatMap = new Map(heat.map((c) => [`${c.dow}-${c.hour}`, Number(c.count)]));
  const hourMap = new Map(peakHours.map((h) => [h.hour, Number(h.count)]));

  const payMap = new Map(monthlyByConcept.map((row) => [row.month, row]));
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

  return {
    totals: t,
    daily,
    byMethod,
    byVehicleType,
    byTariff,
    byEmployee,
    topBoxes,
    monthlyEntries,
    topPlates,
    impact,
    abonoShare,
    monthSeries,
    dowData,
    hourMap,
    maxHour,
    heatMap,
    maxHeat,
  };
}
