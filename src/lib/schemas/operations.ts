import { z } from "zod";
import { idString } from "@/lib/schemas/common";

/**
 * Payload schemas for the operational routes (sessions, cash shifts, print jobs).
 *
 * These describe the JSON the routes already accepted. Fields the routes read
 * with `typeof` and silently defaulted keep exactly that tolerance: a wrong
 * type is treated as absent, never as a validation failure. Required fields
 * stay required; malformed JSON is still handled by `parseBody`.
 */

/** Optional string whose wrong type the routes always ignored. */
const ignoredString = z.string().optional().catch(undefined);

/** Optional boolean whose wrong type the routes always ignored. */
const ignoredBoolean = z.boolean().optional().catch(undefined);

/**
 * Shift bodies are optional: the routes read `notes` inside a try/catch and
 * fell back to no notes, so any non-object body behaves like `{}`.
 */
const optionalNotesBody = z.object({ notes: ignoredString }).catch({});

// --- Sessions -------------------------------------------------------------

export const openSessionSchema = z.object({
  sessionId: idString,
  plate: z.string(),
  vehicleTypeId: idString,
  boxId: idString,
  notes: ignoredString,
  keyLeft: ignoredBoolean,
  damageNotes: ignoredString,
});

export type OpenSessionPayload = z.infer<typeof openSessionSchema>;

export const closeSessionSchema = z.object({
  sessionId: idString,
  methodId: idString,
  notes: ignoredString,
});

export type CloseSessionPayload = z.infer<typeof closeSessionSchema>;

export const moveSessionSchema = z.object({
  sessionId: idString,
  boxId: idString,
});

export type MoveSessionPayload = z.infer<typeof moveSessionSchema>;

// --- Cash shifts ----------------------------------------------------------

export const openShiftSchema = optionalNotesBody;

export type OpenShiftPayload = z.infer<typeof openShiftSchema>;

export const closeShiftSchema = z
  .object({
    notes: ignoredString,
    // Cerrar aunque queden autos adentro: la UI pide confirmación explícita.
    force: ignoredBoolean,
  })
  .catch({});

export type CloseShiftPayload = z.infer<typeof closeShiftSchema>;

// --- Print jobs -----------------------------------------------------------

export const createPrintJobSchema = z.object({
  sessionId: idString,
  kind: z.enum(["entry", "reprint"]),
});

export type CreatePrintJobPayload = z.infer<typeof createPrintJobSchema>;

export const updatePrintJobSchema = z.object({
  id: idString,
  status: z.enum(["printed", "error", "pending"]),
  lastError: ignoredString,
});

export type UpdatePrintJobPayload = z.infer<typeof updatePrintJobSchema>;
