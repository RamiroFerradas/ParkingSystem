import { z } from "zod";

/**
 * Primitive Zod schemas shared by every request payload.
 *
 * These schemas describe the JSON that reaches the API, which is not the same
 * shape the database returns: ids arrive as opaque strings (the database
 * enforces existence) and dates arrive as calendar strings already formatted
 * by the UI. Validating the real shape keeps the runtime contract honest
 * without inventing rules the API never enforced.
 */

/** Canonical UUID text form. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Calendar day in `YYYY-MM-DD` form. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Opaque identifier string. Existence is enforced by the database. */
export const idString = z.string();

/** Strict UUID string (used where the API already validated the format). */
export const uuidString = z.string().regex(UUID_RE, "UUID inválido");

/** Calendar date string (used where the API already validated the format). */
export const calendarDate = z.string().regex(DATE_RE, "Fecha inválida");

/** String trimmed of surrounding whitespace. */
export const trimmed = z.string().trim();

/** Optional string trimmed of surrounding whitespace. */
export const optionalTrimmed = z.string().trim().optional();

/** Free-form notes field. */
export const notes = z.string().optional();

/** Integer coercion for query-string numbers. */
export const intFromQuery = z.coerce.number().int();

/** Clamped integer inside `[min, max]`. */
export function boundedInt(min: number, max: number) {
  return intFromQuery.min(min).max(max);
}

/** A `limit` query parameter clamped to `[1, max]`. */
export function limitSchema(max: number) {
  return boundedInt(1, max);
}

/** Empty JSON object, used where a route accepts an optional body. */
export const emptyObject = z.object({});
