import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildEntryTicket,
  buildExitReceipt,
  type EntryTicketData,
  type ExitReceiptData,
} from "@/lib/print/ticket";

const ESC = 0x1b;
const GS = 0x1d;
const W = 32;

const raw = (bytes: Uint8Array) => Array.from(bytes);
const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));

/** Splits an ESC/POS stream into its printable lines, consuming known commands. */
function decodeLines(bytes: Uint8Array): string[] {
  const b = Array.from(bytes);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < b.length; i++) {
    const v = b[i]!;
    if (v === ESC) {
      const cmd = b[i + 1];
      if (cmd === 0x40) i += 1; // ESC @            init
      else if (cmd === 0x74) i += 2; // ESC t n      code page
      else if (cmd === 0x21) i += 2; // ESC ! n      font size
      else if (cmd === 0x45) i += 2; // ESC E n      bold
      continue;
    }
    if (v === GS) break; // GS V m — cut marker ends the printable area
    if (v === 0x0a) {
      lines.push(cur);
      cur = "";
      continue;
    }
    cur += String.fromCharCode(v);
  }
  return lines;
}

function hasSequence(bytes: number[], text: string): boolean {
  const needle = utf8(text);
  for (let i = 0; i + needle.length <= bytes.length; i++) {
    if (needle.every((byte, j) => bytes[i + j] === byte)) return true;
  }
  return false;
}

const baseEntry: EntryTicketData = {
  parkingName: "PARKING",
  ticketNumber: 42,
  plate: "AB123CD",
  vehicleType: "Auto",
  boxNumber: "7",
  entryAt: "2026-01-15T13:05:00.000Z",
};

const baseExit: ExitReceiptData = {
  parkingName: "MAURICIO'S PARKING",
  ticketNumber: 7,
  plate: "AB123CD",
  vehicleType: "Auto",
  boxNumber: "12",
  entryAt: "2026-01-15T13:00:00.000Z",
  exitAt: "2026-01-15T15:10:00.000Z",
  durationMinutes: 130,
  breakdownLines: [
    { label: "Auto", amountCents: 50_000 },
    { label: "Horas extra (2)", amountCents: 20_000 },
  ],
  totalCents: 70_000,
  methodName: "Efectivo",
};

beforeEach(() => {
  vi.useFakeTimers();
  // Córdoba is UTC-3 year round; 13:05Z prints as 10:05.
  vi.setSystemTime(new Date("2026-01-15T13:05:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildEntryTicket", () => {
  it("emits the exact ESC/POS byte sequence for an entry ticket", () => {
    const expected =
      "\x1b\x40" + // init
      "\x1b\x74\x00" + // code page 0
      "\x1b\x21\x30" + // double width + height
      " ".repeat(12) +
      "PARKING\n" +
      "\x1b\x21\x00" + // normal size
      "\x1b\x45\x01" + // bold on
      " ".repeat(5) +
      "COMPROBANTE DE INGRESO\n" +
      "\x1b\x45\x00" + // bold off
      "-".repeat(32) +
      "\n" +
      "Ticket:" + // 32 - 7 - 2 = 23 spaces
      " ".repeat(23) +
      "42\n" +
      "\x1b\x21\x20" + // double width
      " ".repeat(12) +
      "AB123CD\n" +
      "\x1b\x21\x00" +
      "Tipo:" +
      " ".repeat(23) +
      "Auto\n" +
      "Box:" +
      " ".repeat(27) +
      "7\n" +
      "Ingreso:" +
      " ".repeat(8) +
      "15/01/2026 10:05\n" +
      "Llave:" +
      " ".repeat(18) +
      "RETIRADA\n" +
      "-".repeat(32) +
      "\n" +
      " ".repeat(6) +
      "Conserve este ticket\n" +
      " ".repeat(8) +
      "15/01/2026 10:05\n" +
      "\n\n\n" +
      "\x1d\x56\x42\x00"; // GS V B — feed and cut

    expect(raw(buildEntryTicket(baseEntry))).toEqual(utf8(expected));
  });

  it("lays out the entry ticket on 32 columns", () => {
    const lines = decodeLines(buildEntryTicket(baseEntry));

    expect(lines).toEqual([
      " ".repeat(12) + "PARKING",
      " ".repeat(5) + "COMPROBANTE DE INGRESO",
      "-".repeat(W),
      "Ticket:" + " ".repeat(23) + "42",
      " ".repeat(12) + "AB123CD",
      "Tipo:" + " ".repeat(23) + "Auto",
      "Box:" + " ".repeat(27) + "7",
      "Ingreso:" + " ".repeat(8) + "15/01/2026 10:05",
      "Llave:" + " ".repeat(18) + "RETIRADA",
      "-".repeat(W),
      " ".repeat(6) + "Conserve este ticket",
      " ".repeat(8) + "15/01/2026 10:05",
      "",
      "",
      "",
    ]);
  });

  it("folds accents and ñ down to plain ASCII", () => {
    const lines = decodeLines(
      buildEntryTicket({
        ...baseEntry,
        parkingName: "Estación Peña",
        vehicleType: "Camión",
      }),
    );

    expect(lines[0]).toBe(" ".repeat(9) + "Estacion Pena");
    expect(lines[5]).toBe("Tipo:" + " ".repeat(21) + "Camion");
    for (const line of lines) expect(line).toMatch(/^[\x20-\x7e]*$/);
  });

  it("marks a reprint and keeps the entry layout", () => {
    const lines = decodeLines(buildEntryTicket({ ...baseEntry, reprint: true }));

    expect(lines[1]).toBe(" ".repeat(6) + "*** REIMPRESION ***");
    expect(lines).toContain("Ticket:" + " ".repeat(23) + "42");
  });

  it("reports the key as kept in the car or taken by the operator", () => {
    const kept = decodeLines(buildEntryTicket({ ...baseEntry, keyLeft: true }));
    const taken = decodeLines(buildEntryTicket({ ...baseEntry, keyLeft: false }));

    expect(kept[8]).toBe("Llave:" + " ".repeat(12) + "EN EL VEHICULO");
    expect(taken[8]).toBe("Llave:" + " ".repeat(18) + "RETIRADA");
  });

  it("wraps damage notes and keeps the continuation indented", () => {
    const lines = decodeLines(
      buildEntryTicket({
        ...baseEntry,
        damageNotes: "UNO DOS TRES CUATRO CINCO SEIS",
      }),
    );

    const start = lines.indexOf("Rotura: UNO DOS TRES CUATRO".padEnd(W));
    expect(start).toBeGreaterThan(-1);
    expect(lines[start]).toBe("Rotura: UNO DOS TRES CUATRO".padEnd(W));
    // The continuation must align under the label, not flush-left.
    expect(lines[start + 1]).toBe((" ".repeat(8) + "CINCO SEIS").padEnd(W));
  });

  it("splits a damage word longer than the available room", () => {
    const lines = decodeLines(
      buildEntryTicket({ ...baseEntry, damageNotes: "X".repeat(29) }),
    );

    const start = lines.indexOf(("Rotura: " + "X".repeat(24)).padEnd(W));
    expect(start).toBeGreaterThan(-1);
    expect(lines[start]).toBe("Rotura: " + "X".repeat(24));
    expect(lines[start + 1]).toBe((" ".repeat(8) + "X".repeat(5)).padEnd(W));
  });

  it("truncates a long observation to one 32-column line", () => {
    const lines = decodeLines(
      buildEntryTicket({ ...baseEntry, notes: "abc".repeat(20) }),
    );

    expect(lines).toContain("Obs: " + "abc".repeat(9));
    expect(lines.some((line) => line.startsWith("Obs: "))).toBe(true);
    expect(lines.find((line) => line.startsWith("Obs: "))!.length).toBe(W);
  });

  it("replaces control characters with a space instead of gluing words", () => {
    const lineBreak = decodeLines(
      buildEntryTicket({ ...baseEntry, notes: "uno\ndos" }),
    );
    const controlRun = decodeLines(
      buildEntryTicket({ ...baseEntry, notes: "uno\n\ndos" }),
    );
    const tab = decodeLines(buildEntryTicket({ ...baseEntry, notes: "uno\tdos" }));

    expect(lineBreak).toContain("Obs: uno dos".padEnd(W));
    // A run of non-printables collapses into a single separator.
    expect(controlRun).toContain("Obs: uno dos".padEnd(W));
    expect(tab).toContain("Obs: uno dos".padEnd(W));
    for (const line of [...lineBreak, ...controlRun, ...tab]) {
      expect(line).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("omits the damage and observation lines when there are none", () => {
    const lines = decodeLines(buildEntryTicket(baseEntry));

    expect(lines.some((line) => line.startsWith("Rotura:"))).toBe(false);
    expect(lines.some((line) => line.startsWith("Obs:"))).toBe(false);
  });

  it("prints the business timestamp in UTC-3, including the day rollover", () => {
    const lines = decodeLines(
      buildEntryTicket({ ...baseEntry, entryAt: "2026-01-15T01:30:00.000Z" }),
    );

    expect(lines[7]).toBe("Ingreso:" + " ".repeat(8) + "14/01/2026 22:30");
  });
});

describe("buildExitReceipt", () => {
  it("lays out both timestamps, the duration, the breakdown and the total", () => {
    const lines = decodeLines(buildExitReceipt(baseExit));

    expect(lines).toEqual([
      " ".repeat(7) + "MAURICIO'S PARKING",
      " ".repeat(6) + "COMPROBANTE DE PAGO",
      "-".repeat(W),
      "Ticket:" + " ".repeat(24) + "7",
      "Patente:" + " ".repeat(17) + "AB123CD",
      "Tipo:" + " ".repeat(23) + "Auto",
      "Box:" + " ".repeat(26) + "12",
      "Ingreso:" + " ".repeat(8) + "15/01/2026 10:00",
      "Egreso:" + " ".repeat(9) + "15/01/2026 12:10",
      "Tiempo:" + " ".repeat(17) + "2h 10min",
      "-".repeat(W),
      "Auto" + " ".repeat(21) + "$500,00",
      "Horas extra (2)" + " ".repeat(10) + "$200,00",
      "TOTAL" + " ".repeat(20) + "$700,00",
      "Pago:" + " ".repeat(19) + "Efectivo",
      "-".repeat(W),
      " ".repeat(5) + "Gracias por su visita",
      " ".repeat(8) + "15/01/2026 10:05",
      "",
      "",
      "",
    ]);
  });

  it("bolds only the TOTAL row and cuts the paper at the end", () => {
    const bytes = raw(buildExitReceipt(baseExit));

    expect(
      hasSequence(bytes, "\x1b\x45\x01TOTAL" + " ".repeat(20) + "$700,00\n\x1b\x45\x00"),
    ).toBe(true);
    expect(hasSequence(bytes, "\x1b\x40")).toBe(true);
    expect(bytes.slice(-7)).toEqual([0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00]);
  });

  it("formats durations below one hour with minutes only", () => {
    const lines = decodeLines(buildExitReceipt({ ...baseExit, durationMinutes: 45 }));

    expect(lines).toContain("Tiempo:" + " ".repeat(20) + "45min");
  });

  it("formats the ARS amounts with es-AR thousands separators", () => {
    const lines = decodeLines(
      buildExitReceipt({
        ...baseExit,
        breakdownLines: [{ label: "Estadia", amountCents: 123_456 }],
        totalCents: 123_456,
      }),
    );

    expect(lines).toContain("Estadia" + " ".repeat(16) + "$1.234,56");
    expect(lines).toContain("TOTAL" + " ".repeat(18) + "$1.234,56");
  });

  it("keeps a label wider than the paper on one line instead of truncating", () => {
    const label = "Estadia tarifa nocturna especial larga"; // 36 chars > 32
    const lines = decodeLines(
      buildExitReceipt({
        ...baseExit,
        breakdownLines: [{ label, amountCents: 123_456 }],
        totalCents: 123_456,
      }),
    );

    expect(lines).toContain(`${label} $1.234,56`);
  });

  it("marks a reprint of a payment", () => {
    const lines = decodeLines(buildExitReceipt({ ...baseExit, reprint: true }));

    expect(lines[1]).toBe(" ".repeat(6) + "*** REIMPRESION ***");
  });

  it("prints an empty breakdown as just the total", () => {
    const lines = decodeLines(
      buildExitReceipt({ ...baseExit, breakdownLines: [], totalCents: 0 }),
    );

    expect(lines).toContain("TOTAL" + " ".repeat(22) + "$0,00");
    expect(lines.filter((line) => line.includes("$"))).toHaveLength(1);
  });
});
