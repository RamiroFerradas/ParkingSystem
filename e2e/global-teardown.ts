import { dropSchema } from "./support/schema.ts";
import { resolveE2eSchema } from "./support/schema-guard.ts";

/**
 * Drops the throwaway schema after the run. Skipped when the suite points at an
 * external server (nothing was provisioned here) or when E2E_KEEP_SCHEMA=1 was
 * set for debugging.
 */
export default async function globalTeardown() {
  if (process.env.E2E_BASE_URL) return;
  if (process.env.E2E_KEEP_SCHEMA === "1") {
    console.log("[e2e] E2E_KEEP_SCHEMA=1: keeping the schema for inspection");
    return;
  }

  await dropSchema(resolveE2eSchema());
}
