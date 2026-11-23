import { dropSchema } from "./support/schema.mts";
import { resolveE2eSchema } from "./support/schema-guard.mts";
import { resolveE2eTarget } from "./support/target.mts";

/**
 * Teardown per target:
 *
 *   - `disposable`: drop the throwaway schema.
 *   - `dev`: never drop anything. The rows of the run are kept for inspection
 *     and `dev-fixtures.mts prepare` resets them at the start of the next run.
 *
 * Skipped when the suite points at an external server (nothing was provisioned
 * here) or when `E2E_KEEP_SCHEMA=1` was set for debugging.
 */
export default async function globalTeardown() {
  if (process.env.E2E_BASE_URL) return;
  if (process.env.E2E_KEEP_SCHEMA === "1") {
    console.log("[e2e] E2E_KEEP_SCHEMA=1: keeping the target as-is for inspection");
    return;
  }

  const target = resolveE2eTarget();
  if (target.mode === "dev") {
    // Never drop or purge: `dev-fixtures.mts prepare` resets the branch at the
    // start of the next run, and the rows of this one stay for inspection.
    console.log("[e2e] dev: schema intacto (el reset de la sucursal E2E corre en el próximo prepare)");
    return;
  }

  await dropSchema(resolveE2eSchema());
}
