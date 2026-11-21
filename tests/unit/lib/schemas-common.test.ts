import { describe, expect, it } from "vitest";
import {
  DATE_RE,
  UUID_RE,
  boundedInt,
  calendarDate,
  idString,
  limitSchema,
  optionalTrimmed,
  trimmed,
  uuidString,
} from "@/lib/schemas/common";

describe("shared schema constants", () => {
  it("UUID_RE accepts a canonical uuid and rejects a loose id", () => {
    expect(UUID_RE.test("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(UUID_RE.test("pm-1")).toBe(false);
  });

  it("DATE_RE accepts a calendar day and rejects a timestamp", () => {
    expect(DATE_RE.test("2026-11-20")).toBe(true);
    expect(DATE_RE.test("2026-11-20T10:00:00Z")).toBe(false);
  });
});

describe("primitive schemas", () => {
  it("idString accepts any string and rejects other types", () => {
    expect(idString.safeParse("pm-1").success).toBe(true);
    expect(idString.safeParse(1).success).toBe(false);
  });

  it("uuidString enforces the canonical format", () => {
    expect(uuidString.safeParse("0f8fad5b-d9cb-469f-a165-70867728950e").success).toBe(true);
    expect(uuidString.safeParse("session-1").success).toBe(false);
  });

  it("calendarDate enforces YYYY-MM-DD", () => {
    expect(calendarDate.safeParse("2026-11-20").success).toBe(true);
    expect(calendarDate.safeParse("20/11/2026").success).toBe(false);
  });

  it("trimmed removes surrounding whitespace", () => {
    expect(trimmed.parse("  Efectivo  ")).toBe("Efectivo");
  });

  it("optionalTrimmed allows absence", () => {
    expect(optionalTrimmed.safeParse(undefined).success).toBe(true);
    expect(optionalTrimmed.parse("  x ")).toBe("x");
  });

  it("boundedInt clamps the accepted range and coerces strings", () => {
    expect(boundedInt(1, 10).parse("5")).toBe(5);
    expect(boundedInt(1, 10).safeParse(0).success).toBe(false);
    expect(boundedInt(1, 10).safeParse(11).success).toBe(false);
  });

  it("limitSchema accepts 1..max and rejects NaN", () => {
    expect(limitSchema(500).safeParse("120").success).toBe(true);
    expect(limitSchema(500).safeParse(0).success).toBe(false);
    expect(limitSchema(500).safeParse("nope").success).toBe(false);
  });
});
