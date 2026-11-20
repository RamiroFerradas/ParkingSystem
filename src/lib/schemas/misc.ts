import { z } from "zod";
import { normalizePlate } from "@/lib/plate";

/**
 * Schemas for the API payloads that were still parsed by hand: the auth bodies
 * and the query strings of the list/export routes.
 *
 * Query schemas are total on purpose. The routes they replace clamped numbers
 * and fell back to defaults instead of returning 400, so an out-of-range or
 * non-numeric value has to degrade exactly the same way instead of failing the
 * parse.
 */

/**
 * Integer query param that reproduces the removed `clampLimit`: blank input
 * falls back to `fallback`, then the value is truncated and clamped.
 */
function clampedIntQuery(fallback: number, min: number, max: number) {
  return z.preprocess((raw) => {
    if (typeof raw !== "string" || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }, z.number().int());
}

/**
 * Number query param with the legacy `?? fallback` semantics: only a missing
 * param falls back, while `""` is `Number("") === 0` and clamps like before.
 * `days` was never truncated, so neither is this.
 */
function clampedNumberQuery(fallback: number, min: number, max: number) {
  return z.preprocess((raw) => {
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  }, z.number());
}

/** Validates request query params against a schema, falling back on failure. */
export function parseQuery<S extends z.ZodType>(
  request: Request,
  schema: S,
  fallback: z.output<S>,
): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  return parsed.success ? parsed.data : fallback;
}

/** `POST /api/auth/login` body. Missing fields become empty so the route can reject them. */
export const loginBodySchema = z.object({
  email: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim().toLowerCase()),
  password: z
    .string()
    .optional()
    .transform((value) => value ?? ""),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

/** `POST /api/auth/switch-branch` body. The id is re-validated against the database later. */
export const switchBranchBodySchema = z.object({
  branchId: z.string().min(1),
});

export type SwitchBranchBody = z.infer<typeof switchBranchBodySchema>;

/** `GET /api/vehicles` query. */
export const vehiclesQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim()),
  limit: clampedIntQuery(100, 1, 200),
});

export type VehiclesQuery = z.infer<typeof vehiclesQuerySchema>;

/** `GET /api/vehicles/lookup` query. An empty normalized plate means "not found". */
export const vehicleLookupQuerySchema = z.object({
  plate: z
    .string()
    .optional()
    .transform((value) => normalizePlate(value ?? "")),
});

export type VehicleLookupQuery = z.infer<typeof vehicleLookupQuerySchema>;

/** `GET /api/audit-logs` query. Blank filters become `null` for the SQL. */
export const auditLogsQuerySchema = z.object({
  action: z
    .string()
    .optional()
    .transform((value) => value?.trim() || null),
  entityType: z
    .string()
    .optional()
    .transform((value) => value?.trim() || null),
  limit: clampedIntQuery(100, 1, 500),
});

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;

/** `GET /api/reports/summary` query. */
export const reportSummaryQuerySchema = z.object({
  days: clampedNumberQuery(30, 1, 365),
});

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;

/** `GET /api/reports/export` query. The route resolves the period by key. */
export const reportExportQuerySchema = z.object({
  p: z.string().optional(),
});

export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;

/** `GET /api/sessions/export` query. `parseHistorialFilters` still validates the values. */
export const historialExportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  plate: z.string().optional(),
  typeId: z.string().optional(),
  boxId: z.string().optional(),
  employeeId: z.string().optional(),
  methodId: z.string().optional(),
  status: z.string().optional(),
});

export type HistorialExportQuery = z.infer<typeof historialExportQuerySchema>;
