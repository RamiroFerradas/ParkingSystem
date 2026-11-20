import { describe, it, expect } from "vitest";
import { normalizePlate } from "@/lib/plate";

describe("normalizePlate", () => {
  it("uppercases letters", () => {
    expect(normalizePlate("abc123")).toBe("ABC123");
  });

  it("strips spaces, dashes, dots and every other sign", () => {
    expect(normalizePlate("ab 123-cd.")).toBe("AB123CD");
    expect(normalizePlate("  a.b-c 1 2 3 ")).toBe("ABC123");
  });

  it("keeps digits and letters only, dropping accented or special chars", () => {
    expect(normalizePlate("AÁB1-2_3")).toBe("AB123");
  });

  it("returns an empty string for input without alphanumerics", () => {
    expect(normalizePlate("--- ...")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizePlate("ab-123cd");
    expect(normalizePlate(once)).toBe(once);
  });
});
