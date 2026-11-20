import { z } from "zod";
import { normalizePlate } from "@/lib/plate";

/**
 * Payload schemas for the economic routes: parking tariffs, special periods and
 * monthly subscriptions.
 *
 * These handlers have always been lenient about the JSON type of the fields they
 * read with `typeof`: a blank code is `null`, an unknown `kind` is `hourly`, a
 * non-string plate is empty. That tolerance lives here, so a wrong type degrades
 * exactly like before instead of failing the parse. The rules that answer with
 * their own Spanish message (amount ranges, validity windows, allow-lists)
 * stay in the routes and read these normalized values.
 */

/** Trimmed string; absence or any other JSON type counts as `""`. */
const trimmedOrEmpty = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string(),
);

/** Raw string; absence or any other JSON type counts as `""`. */
const stringOrEmpty = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string(),
);

/** Trimmed string that collapses to `null` when it is blank. */
const trimmedOrNull = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().nullable(),
);

/** Same `Number()` coercion the routes used; `NaN` marks a rejected value. */
const coercedNumber = z.coerce.number().catch(Number.NaN);

/** Boolean honoured only when it is one, otherwise "not provided". */
const optionalBoolean = z.preprocess(
  (value) => (typeof value === "boolean" ? value : undefined),
  z.boolean().optional(),
);

// --- Tariffs --------------------------------------------------------------

/** `POST /api/tariffs`. `code`/`name` stay for old clients; the UI derives them. */
export const createTariffSchema = z.object({
  code: trimmedOrNull,
  name: trimmedOrEmpty,
  description: trimmedOrNull,
  vehicleTypeId: stringOrEmpty,
  /** Anything that is not exactly `monthly` is an hourly block. */
  kind: z.enum(["hourly", "monthly"]).catch("hourly"),
  durationMinutes: coercedNumber,
  amountCents: coercedNumber,
  // Raw on purpose: `parseDate` in the route distinguishes absent from invalid.
  validFrom: z.unknown().optional(),
  validTo: z.unknown().optional(),
});

export type CreateTariffPayload = z.infer<typeof createTariffSchema>;

/** `PATCH /api/tariffs`. Only `id` is required; the rest is a partial update. */
export const updateTariffSchema = z.object({
  id: z.string(),
  amountCents: coercedNumber.optional(),
  isActive: optionalBoolean,
  validFrom: z.unknown().optional(),
  validTo: z.unknown().optional(),
});

export type UpdateTariffPayload = z.infer<typeof updateTariffSchema>;

// --- Special tariff periods ----------------------------------------------

/** `POST /api/special-tariffs`. `priority` floors to an integer and defaults to 100. */
export const createSpecialTariffSchema = z.object({
  name: trimmedOrEmpty,
  startsAt: stringOrEmpty,
  endsAt: stringOrEmpty,
  adjustmentType: stringOrEmpty,
  adjustmentValue: coercedNumber,
  priority: z.preprocess(
    (value) => (typeof value === "number" ? Math.floor(value) : 100),
    z.number().catch(100),
  ),
  /** Only string entries survive; a missing or non-array value means "no filter". */
  vehicleTypeIds: z.preprocess(
    (value) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
    z.array(z.string()),
  ),
});

export type CreateSpecialTariffPayload = z.infer<typeof createSpecialTariffSchema>;

/** `PATCH /api/special-tariffs`: cancellation is the only accepted transition. */
export const cancelSpecialTariffSchema = z.object({
  id: z.string(),
  status: z.literal("cancelled"),
});

export type CancelSpecialTariffPayload = z.infer<typeof cancelSpecialTariffSchema>;

// --- Monthly subscriptions -----------------------------------------------

/** `POST /api/subscriptions`. The plate is normalized here, as the route did. */
export const createSubscriptionSchema = z.object({
  plate: z.preprocess(
    (value) => normalizePlate(typeof value === "string" ? value : ""),
    z.string(),
  ),
  tariffId: stringOrEmpty,
  startsOn: stringOrEmpty,
  endsOn: stringOrEmpty,
  methodId: stringOrEmpty,
  notes: trimmedOrNull,
});

export type CreateSubscriptionPayload = z.infer<typeof createSubscriptionSchema>;

/** `PATCH /api/subscriptions`: only the id is read, and it must have content. */
export const cancelSubscriptionSchema = z.object({
  id: z.string().min(1),
});

export type CancelSubscriptionPayload = z.infer<typeof cancelSubscriptionSchema>;
