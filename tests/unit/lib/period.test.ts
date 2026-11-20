import { describe, it, expect } from "vitest";
import { PERIODS, TZ, resolvePeriod } from "@/lib/reports/period";

describe("PERIODS", () => {
  it("exposes the six report periods in order", () => {
    expect(PERIODS.map((p) => p.key)).toEqual(["hoy", "7", "30", "90", "mes", "anio"]);
  });

  it("every period has a non-empty label and a where builder", () => {
    for (const p of PERIODS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.where).toBe("function");
    }
  });

  it("injects the report column and the Argentina timezone into the predicate", () => {
    const hoy = PERIODS.find((p) => p.key === "hoy")!;
    const sql = hoy.where("s.closed_at");
    expect(sql).toContain("s.closed_at");
    expect(sql).toContain(TZ);
    expect(sql).not.toContain("undefined");
  });

  it("builds rolling-window predicates with the expected interval", () => {
    expect(PERIODS.find((p) => p.key === "7")!.where("c")).toContain("interval '7 days'");
    expect(PERIODS.find((p) => p.key === "30")!.where("c")).toContain("interval '30 days'");
    expect(PERIODS.find((p) => p.key === "90")!.where("c")).toContain("interval '90 days'");
  });
});

describe("resolvePeriod", () => {
  it("returns the period matching the key", () => {
    expect(resolvePeriod("hoy").label).toBe("Hoy");
    expect(resolvePeriod("mes").key).toBe("mes");
    expect(resolvePeriod("anio").key).toBe("anio");
  });

  it("falls back to the fourth period on an unknown or missing key", () => {
    // Documented default in the module is 30 days, but the fallback index is 3
    // ("90"). Pinned as-is: see the finding in the feature log.
    expect(resolvePeriod(undefined).key).toBe("90");
    expect(resolvePeriod("no-existe").key).toBe("90");
  });
});
