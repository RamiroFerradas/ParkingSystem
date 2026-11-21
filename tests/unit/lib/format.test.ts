import { describe, it, expect } from "vitest";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";

// es-AR currency output uses a non-breaking space after "$"; normalize before comparing.
const ns = (s: string) => s.replace(/\u00a0|\u202f/g, " ");

describe("formatARS", () => {
  it("converts cents to pesos with two decimals", () => {
    expect(ns(formatARS(123456))).toBe("$ 1.234,56");
  });

  it("formats zero", () => {
    expect(ns(formatARS(0))).toBe("$ 0,00");
  });

  it("accepts string and bigint cents", () => {
    expect(ns(formatARS("100000"))).toBe("$ 1.000,00");
    expect(ns(formatARS(BigInt(100000)))).toBe("$ 1.000,00");
  });

  it("keeps a negative amount negative", () => {
    expect(ns(formatARS(-5000))).toContain("50,00");
    expect(ns(formatARS(-5000))).toContain("-");
  });
});

describe("formatElapsed", () => {
  it("shows only minutes below one hour", () => {
    expect(formatElapsed(0)).toBe("0 min");
    expect(formatElapsed(45)).toBe("45 min");
    expect(formatElapsed(59)).toBe("59 min");
  });

  it("shows hours and minutes from one hour up", () => {
    expect(formatElapsed(60)).toBe("1 h 0 min");
    expect(formatElapsed(83)).toBe("1 h 23 min");
    expect(formatElapsed(1445)).toBe("24 h 5 min");
  });
});

describe("formatTime", () => {
  it("renders 24h HH:MM in the business timezone", () => {
    // ART = UTC-3: 12:05Z is 09:05 in Cordoba, whatever the runner's TZ is.
    expect(formatTime(new Date("2026-01-15T12:05:00Z"))).toBe("09:05");
    expect(formatTime(new Date("2026-01-16T02:59:00Z"))).toBe("23:59");
  });

  it("accepts an ISO string", () => {
    expect(formatTime("2026-01-15T21:42:00Z")).toBe("18:42");
  });
});

describe("formatDate", () => {
  it("renders DD/MM/YYYY in the business timezone", () => {
    expect(formatDate(new Date("2026-01-15T15:00:00Z"))).toBe("15/01/2026");
    expect(formatDate(new Date("2026-12-01T15:00:00Z"))).toBe("01/12/2026");
  });

  it("accepts an ISO string", () => {
    expect(formatDate("2026-06-09T15:00:00Z")).toBe("09/06/2026");
  });
});
