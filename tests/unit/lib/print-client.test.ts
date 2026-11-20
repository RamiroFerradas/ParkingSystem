import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/print/serial", () => ({ printTicket: vi.fn() }));

import { printTicket } from "@/lib/print/serial";
import {
  PARKING_NAME,
  printSessionTicket,
  type SessionTicketPayload,
} from "@/lib/print/client";

const ESC = 0x1b;
const GS = 0x1d;

/** Printable lines of an ESC/POS stream (known commands are consumed). */
function lines(bytes: Uint8Array): string[] {
  const b = Array.from(bytes);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < b.length; i++) {
    const v = b[i]!;
    if (v === ESC) {
      const cmd = b[i + 1];
      if (cmd === 0x40) i += 1;
      else if (cmd === 0x74 || cmd === 0x21 || cmd === 0x45) i += 2;
      continue;
    }
    if (v === GS) break;
    if (v === 0x0a) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += String.fromCharCode(v);
  }
  return out;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: Mock;

function respond(...responses: Response[]) {
  for (const res of responses) fetchMock.mockResolvedValueOnce(res);
  return fetchMock;
}

function payload(overrides: Partial<SessionTicketPayload> = {}): SessionTicketPayload {
  return {
    ticket_number: "0042",
    plate: "AB123CD",
    vehicle_type_name: "Auto",
    box_number: "7",
    entry_at: "2026-01-15T13:00:00.000Z",
    exit_at: null,
    status: "open",
    duration_minutes: null,
    base_amount_cents: null,
    discount_cents: null,
    surcharge_cents: null,
    final_amount_cents: null,
    method_name: null,
    tariff_snapshot: null,
    entry_notes: null,
    key_left: false,
    damage_notes: null,
    ...overrides,
  };
}

function printed(): Uint8Array {
  const bytes = vi.mocked(printTicket).mock.calls.at(-1)?.[0];
  expect(bytes).toBeInstanceOf(Uint8Array);
  return bytes!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T13:05:00.000Z"));
  fetchMock = vi.fn() as unknown as Mock;
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(printTicket).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("printSessionTicket", () => {
  it("creates a print job, prints the entry ticket and marks it printed", async () => {
    respond(
      jsonResponse({ id: "job-1" }),
      jsonResponse({ session: payload() }),
      jsonResponse({}),
    );

    const result = await printSessionTicket("session-1", "entry");

    expect(result).toEqual({ jobId: "job-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [jobUrl, jobInit] = fetchMock.mock.calls[0]!;
    expect(jobUrl).toBe("/api/print-jobs");
    expect(jobInit!.method).toBe("POST");
    expect(jobInit!.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(jobInit!.body))).toEqual({
      sessionId: "session-1",
      kind: "entry",
    });

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[1]!;
    expect(sessionUrl).toBe("/api/sessions/session-1");
    expect(sessionInit!.method).toBe("GET");
    expect(sessionInit!.body).toBeUndefined();

    const [, patchInit] = fetchMock.mock.calls[2]!;
    expect(patchInit!.method).toBe("PATCH");
    expect(JSON.parse(String(patchInit!.body))).toEqual({
      id: "job-1",
      status: "printed",
    });

    const body = lines(printed());
    expect(body[0]).toContain(PARKING_NAME);
    expect(body.some((line) => line.includes("COMPROBANTE DE INGRESO"))).toBe(true);
    expect(body.some((line) => line.includes("AB123CD"))).toBe(true);
  });

  it("prints the exit receipt for a closed session", async () => {
    respond(
      jsonResponse({ id: "job-2" }),
      jsonResponse({
        session: payload({
          status: "closed",
          plate: null,
          exit_at: "2026-01-15T15:10:00.000Z",
          duration_minutes: 130,
          base_amount_cents: "50000",
          final_amount_cents: "70000",
          method_name: "Efectivo",
          tariff_snapshot: {
            block: { name: "Auto", amount_cents: 50_000 },
            extra_hours: 2,
            hourly_amount_cents: 10_000,
          },
        }),
      }),
      jsonResponse({}),
    );

    await printSessionTicket("session-2", "exit");

    const body = lines(printed());
    expect(body.some((line) => line.includes("COMPROBANTE DE PAGO"))).toBe(true);
    expect(body).toContain("Auto" + " ".repeat(21) + "$500,00");
    expect(body).toContain("Horas extra (2)" + " ".repeat(10) + "$200,00");
    expect(body.some((line) => line.startsWith("TOTAL") && line.includes("$700,00"))).toBe(true);
    expect(body.some((line) => line.startsWith("Pago:") && line.includes("Efectivo"))).toBe(true);
    expect(body.some((line) => line.startsWith("Tiempo:") && line.includes("2h 10min"))).toBe(true);
  });

  it("registers exit prints as 'reprint' because the enum has only two kinds", async () => {
    respond(
      jsonResponse({ id: "job-3" }),
      jsonResponse({ session: payload({ status: "closed", exit_at: "2026-01-15T15:00:00Z" }) }),
      jsonResponse({}),
    );

    await printSessionTicket("session-3", "exit");

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/print-jobs");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      sessionId: "session-3",
      kind: "reprint",
    });
  });

  it("marks a reprint of an open session on the entry layout", async () => {
    respond(
      jsonResponse({ id: "job-4" }),
      jsonResponse({ session: payload() }),
      jsonResponse({}),
    );

    await printSessionTicket("session-4", "reprint");

    const body = lines(printed());
    expect(body.some((line) => line.includes("*** REIMPRESION ***"))).toBe(true);
    // Still the entry layout: key line and the keep-this-ticket footer.
    expect(body.some((line) => line.startsWith("Llave:"))).toBe(true);
    expect(body.some((line) => line.includes("Conserve este ticket"))).toBe(true);
  });

  it("falls back to an 'Estadia' line when the tariff snapshot is missing", async () => {
    respond(
      jsonResponse({ id: "job-5" }),
      jsonResponse({
        session: payload({
          status: "closed",
          exit_at: "2026-01-15T15:00:00Z",
          base_amount_cents: "50000",
          final_amount_cents: null,
          method_name: null,
        }),
      }),
      jsonResponse({}),
    );

    await printSessionTicket("session-5", "exit");

    const body = lines(printed());
    expect(body).toContain("Estadia" + " ".repeat(18) + "$500,00");
    expect(body.some((line) => line.startsWith("TOTAL") && line.includes("$500,00"))).toBe(true);
    expect(body.some((line) => line.startsWith("Pago:") && line.endsWith("-"))).toBe(true);
  });

  it("prints a single no-charge line for an abono snapshot", async () => {
    respond(
      jsonResponse({ id: "job-6" }),
      jsonResponse({
        session: payload({
          status: "closed",
          exit_at: "2026-01-15T15:00:00Z",
          final_amount_cents: "0",
          tariff_snapshot: { abono: true },
        }),
      }),
      jsonResponse({}),
    );

    await printSessionTicket("session-6", "exit");

    const body = lines(printed());
    expect(body.filter((line) => line.includes("Abonado (sin cargo)"))).toHaveLength(1);
    expect(body.some((line) => line.startsWith("TOTAL") && line.includes("$0,00"))).toBe(true);
  });

  it("records the job as errored and rethrows when printing fails", async () => {
    vi.mocked(printTicket).mockRejectedValue(
      new Error("Web Serial no disponible en este navegador"),
    );
    respond(
      jsonResponse({ id: "job-7" }),
      jsonResponse({ session: payload() }),
      jsonResponse({}),
    );

    await expect(printSessionTicket("session-7", "entry")).rejects.toThrow(
      "Web Serial no disponible en este navegador",
    );

    const [, patchInit] = fetchMock.mock.calls.at(-1)!;
    expect(patchInit!.method).toBe("PATCH");
    expect(JSON.parse(String(patchInit!.body))).toEqual({
      id: "job-7",
      status: "error",
      lastError: "Web Serial no disponible en este navegador",
    });
  });

  it("still rethrows the print error when the error report itself fails", async () => {
    vi.mocked(printTicket).mockRejectedValue(new Error("port busy"));
    respond(
      jsonResponse({ id: "job-8" }),
      jsonResponse({ session: payload() }),
    );
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    await expect(printSessionTicket("session-8", "entry")).rejects.toThrow("port busy");
  });

  it("reports a failed payload fetch and rethrows its message", async () => {
    respond(
      jsonResponse({ id: "job-9" }),
      jsonResponse({ error: "Estadía inexistente" }, 404),
      jsonResponse({}),
    );

    await expect(printSessionTicket("missing", "entry")).rejects.toThrow(
      "Estadía inexistente",
    );

    expect(printTicket).not.toHaveBeenCalled();
    const [, patchInit] = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(String(patchInit!.body))).toEqual({
      id: "job-9",
      status: "error",
      lastError: "Estadía inexistente",
    });
  });

  it("does not print or patch when the print job cannot be created", async () => {
    respond(jsonResponse({ error: "Sesión requerida" }, 401));

    await expect(printSessionTicket("session-10", "entry")).rejects.toThrow(
      "Sesión requerida",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(printTicket).not.toHaveBeenCalled();
  });
});
