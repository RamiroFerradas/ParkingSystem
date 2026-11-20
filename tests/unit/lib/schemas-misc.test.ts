import { describe, expect, it } from "vitest";
import {
  auditLogsQuerySchema,
  historialExportQuerySchema,
  loginBodySchema,
  parseQuery,
  reportExportQuerySchema,
  reportSummaryQuerySchema,
  switchBranchBodySchema,
  vehicleLookupQuerySchema,
  vehiclesQuerySchema,
} from "@/lib/schemas/misc";
import { z } from "zod";

function query(search: string) {
  return new Request(`http://localhost/api/test${search}`);
}

describe("loginBodySchema", () => {
  it("trims and lower-cases the email while keeping the password intact", () => {
    expect(
      loginBodySchema.parse({ email: "  ANA@Example.COM ", password: " Secret " }),
    ).toEqual({ email: "ana@example.com", password: " Secret " });
  });

  it("fills absent fields with empty strings so the route rejects them", () => {
    expect(loginBodySchema.parse({})).toEqual({ email: "", password: "" });
    expect(loginBodySchema.parse({ email: "   " })).toEqual({ email: "", password: "" });
  });

  it("rejects a payload that is not an object", () => {
    expect(loginBodySchema.safeParse(null).success).toBe(false);
    expect(loginBodySchema.safeParse("nope").success).toBe(false);
  });
});

describe("switchBranchBodySchema", () => {
  it("accepts any non-empty string without trimming it", () => {
    expect(switchBranchBodySchema.parse({ branchId: " branch-1 " })).toEqual({
      branchId: " branch-1 ",
    });
  });

  it("rejects a missing, empty or non-string branch id", () => {
    expect(switchBranchBodySchema.safeParse({}).success).toBe(false);
    expect(switchBranchBodySchema.safeParse({ branchId: "" }).success).toBe(false);
    expect(switchBranchBodySchema.safeParse({ branchId: 7 }).success).toBe(false);
  });
});

describe("vehiclesQuerySchema", () => {
  it("defaults to an empty search and a limit of 100", () => {
    expect(vehiclesQuerySchema.parse({})).toEqual({ q: "", limit: 100 });
  });

  it("trims q", () => {
    expect(vehiclesQuerySchema.parse({ q: " ab12 " }).q).toBe("ab12");
  });

  it("clamps the limit into 1..200", () => {
    expect(vehiclesQuerySchema.parse({ limit: "0" }).limit).toBe(1);
    expect(vehiclesQuerySchema.parse({ limit: "500" }).limit).toBe(200);
    expect(vehiclesQuerySchema.parse({ limit: "25" }).limit).toBe(25);
  });

  it("falls back to 100 for blank or non-numeric limits", () => {
    expect(vehiclesQuerySchema.parse({ limit: "" }).limit).toBe(100);
    expect(vehiclesQuerySchema.parse({ limit: "abc" }).limit).toBe(100);
  });
});

describe("vehicleLookupQuerySchema", () => {
  it("normalizes the plate to A-Z0-9", () => {
    expect(vehicleLookupQuerySchema.parse({ plate: "ab-123-cd" }).plate).toBe("AB123CD");
  });

  it("returns an empty plate when it is missing or has no alphanumerics", () => {
    expect(vehicleLookupQuerySchema.parse({}).plate).toBe("");
    expect(vehicleLookupQuerySchema.parse({ plate: "-.-" }).plate).toBe("");
  });
});

describe("auditLogsQuerySchema", () => {
  it("defaults both filters to null and the limit to 100", () => {
    expect(auditLogsQuerySchema.parse({})).toEqual({
      action: null,
      entityType: null,
      limit: 100,
    });
  });

  it("trims filters and turns blank ones into null", () => {
    expect(auditLogsQuerySchema.parse({ action: " login ", entityType: "profile" })).toEqual({
      action: "login",
      entityType: "profile",
      limit: 100,
    });
    expect(auditLogsQuerySchema.parse({ action: " ", entityType: "" })).toEqual({
      action: null,
      entityType: null,
      limit: 100,
    });
  });

  it("clamps the limit into 1..500 and falls back for non-numbers", () => {
    expect(auditLogsQuerySchema.parse({ limit: "1000" }).limit).toBe(500);
    expect(auditLogsQuerySchema.parse({ limit: "0" }).limit).toBe(1);
    expect(auditLogsQuerySchema.parse({ limit: "abc" }).limit).toBe(100);
  });
});

describe("reportSummaryQuerySchema", () => {
  it("defaults to 30 days", () => {
    expect(reportSummaryQuerySchema.parse({}).days).toBe(30);
  });

  it("clamps the window into 1..365", () => {
    expect(reportSummaryQuerySchema.parse({ days: "0" }).days).toBe(1);
    expect(reportSummaryQuerySchema.parse({ days: "9999" }).days).toBe(365);
    expect(reportSummaryQuerySchema.parse({ days: "7" }).days).toBe(7);
  });

  it("keeps the legacy blank/non-numeric behaviour", () => {
    // `?? 30` only covered a missing param: `""` was `Number("") === 0` -> 1.
    expect(reportSummaryQuerySchema.parse({ days: "" }).days).toBe(1);
    expect(reportSummaryQuerySchema.parse({ days: "abc" }).days).toBe(30);
    // Only NaN used to be unsafe; infinities clamped like any other number.
    expect(reportSummaryQuerySchema.parse({ days: "Infinity" }).days).toBe(365);
    expect(reportSummaryQuerySchema.parse({ days: "-Infinity" }).days).toBe(1);
  });
});

describe("export query schemas", () => {
  it("passes the report period through", () => {
    expect(reportExportQuerySchema.parse({ p: "hoy" }).p).toBe("hoy");
    expect(reportExportQuerySchema.parse({}).p).toBeUndefined();
  });

  it("keeps known history filters and strips unknown params", () => {
    expect(
      historialExportQuerySchema.parse({
        from: "2026-01-01",
        status: "open",
        plate: "ab123cd",
        bad: "1",
      }),
    ).toEqual({ from: "2026-01-01", status: "open", plate: "ab123cd" });
  });
});

describe("parseQuery", () => {
  it("reads params from the request URL", () => {
    expect(parseQuery(query("?q=%20ab12%20&limit=25"), vehiclesQuerySchema, {
      q: "",
      limit: 100,
    })).toEqual({ q: "ab12", limit: 25 });
  });

  it("returns the fallback when the schema rejects the params", () => {
    const strict = z.object({ n: z.literal("x") });

    expect(parseQuery(query("?n=1"), strict, { n: "x" })).toEqual({ n: "x" });
  });
});
