import { describe, it, expect } from "vitest";
import {
  LONG_SHIFT_MINUTES,
  formatElapsedText,
  shiftNoun,
} from "@/lib/shifts/format";

describe("formatElapsedText", () => {
  it("says 'Recién abierto' for anything under one minute", () => {
    expect(formatElapsedText(0)).toBe("Recién abierto");
    expect(formatElapsedText(0.5)).toBe("Recién abierto");
    expect(formatElapsedText(-5)).toBe("Recién abierto");
  });

  it("prefixes the elapsed time with 'Hace'", () => {
    expect(formatElapsedText(1)).toBe("Hace 1 min");
    expect(formatElapsedText(59)).toBe("Hace 59 min");
    expect(formatElapsedText(60)).toBe("Hace 1 h 0 min");
    expect(formatElapsedText(83)).toBe("Hace 1 h 23 min");
  });
});

describe("shiftNoun", () => {
  it("is singular only for exactly one vehicle", () => {
    expect(shiftNoun(0)).toBe("vehículos");
    expect(shiftNoun(1)).toBe("vehículo");
    expect(shiftNoun(2)).toBe("vehículos");
    expect(shiftNoun(11)).toBe("vehículos");
  });
});

describe("LONG_SHIFT_MINUTES", () => {
  it("warns from eight hours on", () => {
    expect(LONG_SHIFT_MINUTES).toBe(480);
  });
});
