import { z } from "zod";
import { trimmed } from "@/lib/schemas/common";

/**
 * Payload schemas for the catalog endpoints: payment methods, vehicle types,
 * branches, floors and boxes.
 *
 * The handlers have always been lenient about the JSON type of optional
 * fields: anything that is not a string/boolean/number means "not provided",
 * never a validation error. The `optionalX` helpers keep that contract. PATCH
 * schemas also preserve the values exactly as sent, because the audit rows
 * record the request values (only the SQL parameters are normalized).
 */

/** Optional string; any other JSON type is treated as absent. */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional(),
);

/** Optional boolean; any other JSON type is treated as absent. */
const optionalBoolean = z.preprocess(
  (value) => (typeof value === "boolean" ? value : undefined),
  z.boolean().optional(),
);

/** Optional number; any other JSON type is treated as absent. */
const optionalNumber = z.preprocess(
  (value) => (typeof value === "number" ? value : undefined),
  z.number().optional(),
);

/** Number floored to an integer, with absence or any other type counting as zero. */
const flooredOrZero = z.preprocess(
  (value) => (typeof value === "number" ? Math.floor(value) : 0),
  z.number(),
);

/** String trimmed and upper-cased, with absence or any other type counting as "". */
const upperTrimmedOrEmpty = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : ""),
  z.string(),
);

/** String trimmed, with absence or any other type counting as "". */
const trimmedOrEmpty = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string(),
);

/** Code derived from a name when the caller does not send one. */
function codeFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 20);
}

/** `POST /api/payment-methods`: code (up to 20) and name (up to 40). */
export const createCatalogSchema = z.object({
  code: trimmed.toUpperCase().min(1).max(20),
  name: trimmed.min(1).max(40),
});
export type CreateCatalogBody = z.infer<typeof createCatalogSchema>;

/** `PATCH /api/payment-methods`: `name` updates only when it has content. */
export const updatePaymentMethodSchema = z.object({
  id: z.string(),
  name: optionalString,
  isActive: optionalBoolean,
});
export type UpdatePaymentMethodBody = z.infer<typeof updatePaymentMethodSchema>;

/** `POST /api/vehicle-types`: an explicit code wins, otherwise it is derived. */
export const createVehicleTypeSchema = z
  .object({
    code: upperTrimmedOrEmpty,
    name: trimmed.min(1).max(40),
    sortOrder: flooredOrZero,
  })
  .transform((input) => ({ ...input, code: input.code || codeFromName(input.name) }));
export type CreateVehicleTypeBody = z.infer<typeof createVehicleTypeSchema>;

/** `PATCH /api/vehicle-types`. */
export const updateVehicleTypeSchema = z.object({
  id: z.string(),
  name: optionalString,
  sortOrder: optionalNumber,
  isActive: optionalBoolean,
});
export type UpdateVehicleTypeBody = z.infer<typeof updateVehicleTypeSchema>;

/** `POST /api/branches`: only the name is required; a blank code becomes NULL. */
export const createBranchSchema = z.object({
  name: trimmed.min(1),
  code: trimmedOrEmpty,
});
export type CreateBranchBody = z.infer<typeof createBranchSchema>;

/** `PATCH /api/branches/[id]`: a blank code explicitly clears the column. */
export const updateBranchSchema = z.object({
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : undefined),
    z.string().min(1).optional(),
  ),
  code: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : undefined),
    z.string().nullable().optional(),
  ),
  isActive: optionalBoolean,
});
export type UpdateBranchBody = z.infer<typeof updateBranchSchema>;

/** `POST /api/floors`: the box-count range and prefix rule stay in the route. */
export const createFloorSchema = z.object({
  name: trimmed.min(1).max(50),
  boxCount: flooredOrZero,
  prefix: upperTrimmedOrEmpty,
  sortOrder: flooredOrZero,
});
export type CreateFloorBody = z.infer<typeof createFloorSchema>;

/** `PATCH /api/floors`. */
export const updateFloorSchema = z.object({
  id: z.string(),
  name: optionalString,
  sortOrder: optionalNumber,
  isActive: optionalBoolean,
});
export type UpdateFloorBody = z.infer<typeof updateFloorSchema>;

/** `POST /api/boxes`: number up to 12; a blank sector is stored as NULL. */
export const createBoxSchema = z.object({
  floorId: z.string(),
  number: trimmed.toUpperCase().min(1).max(12),
  sector: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().nullable(),
  ),
});
export type CreateBoxBody = z.infer<typeof createBoxSchema>;

/** `PATCH /api/boxes`. */
export const updateBoxSchema = z.object({
  id: z.string(),
  number: optionalString,
  sector: optionalString,
  floorId: optionalString,
  isActive: optionalBoolean,
});
export type UpdateBoxBody = z.infer<typeof updateBoxSchema>;

/** `POST /api/boxes/toggle`. */
export const toggleBoxServiceSchema = z.object({
  boxId: z.string(),
  serviceEnabled: z.boolean(),
});
export type ToggleBoxServiceBody = z.infer<typeof toggleBoxServiceSchema>;
