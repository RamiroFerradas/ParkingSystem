import { query } from "@/lib/db/client";

/** Filtros del historial de estadías (server-side, via URL searchParams). */
export interface HistorialFilters {
  from?: string;
  to?: string;
  plate?: string;
  typeId?: string;
  boxId?: string;
  /** Perfil que cerró/cobró la estadía. */
  employeeId?: string;
  methodId?: string;
  status?: string;
}

const VALID_STATUS = new Set(["open", "closed"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `DATE_RE` valida sólo la forma; esto exige además que el día exista. */
function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year); // Date.UTC mapea los años 0..99 a 1900+year
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

type SearchParamsValue = string | string[] | undefined;

function firstValue(value: SearchParamsValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseHistorialFilters(
  searchParams: Record<string, SearchParamsValue>,
): HistorialFilters {
  const filters: HistorialFilters = {};

  const from = firstValue(searchParams.from);
  if (from && isCalendarDate(from)) filters.from = from;

  const to = firstValue(searchParams.to);
  if (to && isCalendarDate(to)) filters.to = to;

  const plate = firstValue(searchParams.plate)?.trim();
  if (plate) filters.plate = plate.toUpperCase();

  for (const key of ["typeId", "boxId", "employeeId", "methodId"] as const) {
    const value = firstValue(searchParams[key]);
    if (value && UUID_RE.test(value)) filters[key] = value;
  }

  const status = firstValue(searchParams.status);
  if (status && VALID_STATUS.has(status)) filters.status = status;

  return filters;
}

interface HistorialRowBase {
  id: string;
  ticket_number: string;
  plate: string | null;
  vehicle_type_name: string;
  box_number: string;
  entry_at: string;
  exit_at: string | null;
  status: string;
  duration_minutes: number | null;
  final_amount_cents: string | null;
  closed_by_name: string | null;
}

/**
 * Alcance de lectura por rol: sin `session.read_all`, un usuario solo ve las
 * estadías que abrió (permiso `session.read_own`).
 */
export interface HistorialScope {
  ownerId?: string;
}

function historialWhere(
  filters: HistorialFilters,
  scope: HistorialScope = {},
): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const next = () => `$${params.length}`;

  if (scope.ownerId) {
    params.push(scope.ownerId);
    clauses.push(`s.opened_by = ${next()}::uuid`);
  }

  if (filters.from) {
    params.push(filters.from);
    clauses.push(`(s.entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date >= ${next()}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`(s.entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date <= ${next()}::date`);
  }
  if (filters.plate) {
    params.push(`%${filters.plate}%`);
    clauses.push(`v.plate ILIKE ${next()}`);
  }
  if (filters.typeId) {
    params.push(filters.typeId);
    clauses.push(`s.vehicle_type_id = ${next()}::uuid`);
  }
  if (filters.boxId) {
    params.push(filters.boxId);
    clauses.push(`s.box_id = ${next()}::uuid`);
  }
  if (filters.employeeId) {
    params.push(filters.employeeId);
    clauses.push(`s.closed_by = ${next()}::uuid`);
  }
  if (filters.methodId) {
    params.push(filters.methodId);
    clauses.push(
      `EXISTS (SELECT 1 FROM payments p WHERE p.session_id = s.id AND p.method_id = ${next()}::uuid)`,
    );
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`s.status = ${next()}`);
  }

  return { clauses, params };
}

const HISTORIAL_SELECT = `
    SELECT s.id,
           s.ticket_number::text AS ticket_number,
           v.plate,
           vt.name AS vehicle_type_name,
           b.number AS box_number,
           s.entry_at,
           s.exit_at,
           s.status,
           s.duration_minutes,
           s.final_amount_cents::text AS final_amount_cents,
           pc.email AS closed_by_name
      FROM parking_sessions s
      JOIN vehicles v       ON v.id = s.vehicle_id
      JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
      JOIN parking_boxes b  ON b.id = s.box_id
      LEFT JOIN profiles pc ON pc.id = s.closed_by`;

export async function loadHistorial(
  filters: HistorialFilters,
  limit = 500,
  scope: HistorialScope = {},
): Promise<HistorialRowBase[]> {
  const { clauses, params } = historialWhere(filters, scope);
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  return query<HistorialRowBase>(
    `${HISTORIAL_SELECT}${where}
      ORDER BY s.entry_at DESC
      LIMIT ${limit}`,
    params,
  );
}

export async function loadHistorialAll(
  filters: HistorialFilters,
  scope: HistorialScope = {},
): Promise<HistorialRowBase[]> {
  const { clauses, params } = historialWhere(filters, scope);
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  return query<HistorialRowBase>(`${HISTORIAL_SELECT}${where} ORDER BY s.entry_at DESC`, params);
}

export interface HistorialOptions {
  types: { id: string; name: string }[];
  boxes: { id: string; number: string }[];
  employees: { id: string; full_name: string }[];
  methods: { id: string; name: string }[];
}

export async function loadFilterOptions(): Promise<HistorialOptions> {
  const [types, boxes, employees, methods] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order`,
    ),
    query<{ id: string; number: string }>(
      `SELECT id, number FROM parking_boxes ORDER BY number`,
    ),
    query<{ id: string; full_name: string }>(
      `SELECT id, email AS full_name FROM profiles WHERE is_active ORDER BY email`,
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM payment_methods WHERE is_active ORDER BY sort_order`,
    ),
  ]);
  return { types, boxes, employees, methods };
}
