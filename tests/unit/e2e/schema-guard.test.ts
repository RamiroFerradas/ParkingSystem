import { describe, expect, it } from "vitest";
import {
  DEFAULT_E2E_SCHEMA,
  assertSafeSchema,
  resolveE2eSchema,
} from "../../../e2e/support/schema-guard.mts";

describe("assertSafeSchema", () => {
  it("accepts a dedicated test schema", () => {
    expect(assertSafeSchema("test_e2e_local")).toBe("test_e2e_local");
  });

  it("normalises surrounding whitespace and case", () => {
    expect(assertSafeSchema("  TEST_E2E_RUN_42  ")).toBe("test_e2e_run_42");
  });

  it("refuses production and development schemas", () => {
    expect(() => assertSafeSchema("public")).toThrow(/public/);
    expect(() => assertSafeSchema("dev")).toThrow(/dev/);
  });

  it("refuses an empty schema", () => {
    expect(() => assertSafeSchema("")).toThrow(/required/);
    expect(() => assertSafeSchema(undefined)).toThrow(/required/);
  });

  it("refuses names outside the test_e2e_ namespace", () => {
    expect(() => assertSafeSchema("parking")).toThrow(/test_e2e_/);
    expect(() => assertSafeSchema("test-e2e-local")).toThrow(/test_e2e_/);
  });
});

describe("resolveE2eSchema", () => {
  it("falls back to the local default", () => {
    expect(resolveE2eSchema({})).toBe(DEFAULT_E2E_SCHEMA);
  });

  it("honours an explicit safe override", () => {
    expect(resolveE2eSchema({ E2E_SCHEMA: "test_e2e_ci" })).toBe("test_e2e_ci");
  });

  it("refuses an unsafe override", () => {
    expect(() => resolveE2eSchema({ E2E_SCHEMA: "dev" })).toThrow(/dev/);
  });
});
