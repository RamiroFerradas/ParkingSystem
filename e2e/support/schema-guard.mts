// @ts-nocheck — módulo heredado de .mjs (scripts de soporte de Playwright).
// Se convirtió a .ts para que el loader de Playwright y Node coincidan en el
// formato de módulo; tiparlo por completo queda fuera de este cambio.
/**
 * Safety gate for the Playwright suite's database target.
 *
 * The e2e harness recreates a whole Postgres schema from `db/migrations` and
 * seeds throwaway users into it. Pointing that at `public` (production) or
 * `dev` (shared development data) would destroy real records, so every entry
 * point resolves the schema through this module and nothing else.
 *
 * The suite owns its own namespace: `test_e2e_*`. Anything else is refused.
 */

export const E2E_SCHEMA_PATTERN = /^test_e2e_[a-z0-9_]+$/;

/** Schema used when E2E_SCHEMA is not set (local developer runs). */
export const DEFAULT_E2E_SCHEMA = "test_e2e_local";

/** Schemas that must never be recreated, even by mistake. */
export const FORBIDDEN_SCHEMAS = ["public", "dev", "prod", "production"];

/**
 * @param {string} value
 * @param {string} reason
 * @returns {Error}
 */
function invalid(value: string, reason: string): Error {
  return new Error(
    `Refusing to run the e2e suite against schema "${value}": ${reason}. ` +
      "The Playwright suite drops and recreates its target schema, so it only " +
      `accepts dedicated names matching ${E2E_SCHEMA_PATTERN.source} ` +
      `(for example "${DEFAULT_E2E_SCHEMA}").`,
  );
}

/**
 * Validates and normalises an e2e schema name, or throws.
 * @param {string | undefined | null} schema
 * @returns {string}
 */
export function assertSafeSchema(schema) {
  if (typeof schema !== "string" || schema.trim() === "") {
    throw new Error(
      "E2E_SCHEMA is required: the Playwright suite always runs against a " +
        `dedicated schema matching ${E2E_SCHEMA_PATTERN.source}.`,
    );
  }

  const value = schema.trim().toLowerCase();

  if (FORBIDDEN_SCHEMAS.includes(value)) {
    throw invalid(value, "it is a real environment, not a throwaway test schema");
  }

  if (!E2E_SCHEMA_PATTERN.test(value)) {
    throw invalid(value, `it does not match ${E2E_SCHEMA_PATTERN.source}`);
  }

  return value;
}

/**
 * Resolves the schema from the environment, defaulting to the local one.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveE2eSchema(env: Record<string, string | undefined> = process.env) {
  return assertSafeSchema(env.E2E_SCHEMA ?? DEFAULT_E2E_SCHEMA);
}
