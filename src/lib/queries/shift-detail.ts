import { query } from "@/lib/db/client";
import { TZ } from "@/lib/reports/period";

export interface ShiftHeader {
  id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  minutes: string;
  opened_by_name: string;
  closed_by_name: string | null;
  opening_notes: string | null;
  closing_notes: string | null;
  closing_open_sessions: string;
}

export interface ShiftSummary {
  entered: string;
  still_open: string;
  paid_count: string;
  collected: string;
}

export interface ShiftMethodRow {
  name: string;
  total: string;
  payments: string;
}

export interface ShiftSessionRow {
  id: string;
  ticket_number: string;
  plate: string;
  vehicle_type: string;
  box_number: string;
  entry_at: string;
  exit_at: string | null;
  status: string;
  charged_cents: string | null;
  method_name: string | null;
}

/** Filtros opcionales del detalle: rango horario y patente. */
export interface ShiftDetailFilters {
  from: number | null;
  to: number | null;
  plateQuery: string;
}

export interface ShiftDetail {
  shift: ShiftHeader;
  summary: ShiftSummary;
  methods: ShiftMethodRow[];
  sessions: ShiftSessionRow[];
}

/**
 * Cabecera, resumen, medios de pago y movimientos de un turno.
 * Devuelve `null` cuando el turno no existe (la página decide el `notFound()`).
 */
export async function loadShiftDetail(
  id: string,
  filters: ShiftDetailFilters,
): Promise<ShiftDetail | null> {
  const headers = await query<ShiftHeader>(
    `SELECT cs.id,
            cs.status::text AS status,
            cs.opened_at::text,
            cs.closed_at::text,
            GREATEST(0, round(extract(epoch FROM (COALESCE(cs.closed_at, now()) - cs.opened_at)) / 60))::text AS minutes,
            po.email AS opened_by_name,
            pc.email AS closed_by_name,
            cs.opening_notes,
            cs.closing_notes,
            cs.closing_open_sessions::text
       FROM cash_shifts cs
       JOIN profiles po ON po.id = cs.opened_by
       LEFT JOIN profiles pc ON pc.id = cs.closed_by
      WHERE cs.id = $1`,
    [id],
  );
  const shift = headers[0];
  if (!shift) return null;

  const hourFilter = filters.from !== null && filters.to !== null;

  const [summaryRows, methods, sessions] = await Promise.all([
    query<ShiftSummary>(
      `SELECT (SELECT count(*) FROM parking_sessions WHERE shift_id = $1)::text AS entered,
              (SELECT count(*) FROM parking_sessions WHERE shift_id = $1 AND status = 'open')::text AS still_open,
              (SELECT count(*) FROM payments WHERE shift_id = $1)::text AS paid_count,
              (SELECT COALESCE(sum(amount_charged_cents), 0) FROM payments WHERE shift_id = $1)::text AS collected`,
      [id],
    ),
    query<ShiftMethodRow>(
      `SELECT pm.name,
              COALESCE(sum(p.amount_charged_cents), 0)::text AS total,
              count(p.id)::text AS payments
         FROM payment_methods pm
         LEFT JOIN payments p ON p.method_id = pm.id AND p.shift_id = $1
        GROUP BY pm.name, pm.sort_order
        ORDER BY pm.sort_order`,
      [id],
    ),
    query<ShiftSessionRow>(
      `SELECT s.id,
              s.ticket_number::text,
              v.plate,
              vt.name AS vehicle_type,
              b.number AS box_number,
              s.entry_at::text,
              s.exit_at::text,
              s.status::text,
              p.amount_charged_cents::text AS charged_cents,
              pm.name AS method_name
         FROM parking_sessions s
         JOIN vehicles v      ON v.id = s.vehicle_id
         JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
         JOIN parking_boxes b ON b.id = s.box_id
         LEFT JOIN payments p ON p.session_id = s.id
         LEFT JOIN payment_methods pm ON pm.id = p.method_id
        WHERE s.shift_id = $1
          AND ($2::int IS NULL OR $3::int IS NULL
               OR extract(hour FROM s.entry_at AT TIME ZONE '${TZ}')::int BETWEEN $2 AND $3)
          AND ($4::text IS NULL OR v.plate ILIKE '%' || $4 || '%')
        ORDER BY s.entry_at DESC`,
      [id, hourFilter ? filters.from : null, hourFilter ? filters.to : null, filters.plateQuery || null],
    ),
  ]);

  const summary = summaryRows[0] ?? {
    entered: "0",
    still_open: "0",
    paid_count: "0",
    collected: "0",
  };

  return { shift, summary, methods, sessions };
}
