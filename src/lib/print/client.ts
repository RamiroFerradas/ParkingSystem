"use client";

import { buildEntryTicket, buildExitReceipt } from "./ticket";
import { printTicket } from "./serial";

export const PARKING_NAME = "SMARTDRIVE PARKING SA";

export interface SessionTicketPayload {
  ticket_number: string;
  plate: string | null;
  vehicle_type_name: string;
  box_number: string;
  entry_at: string;
  exit_at: string | null;
  status: string;
  duration_minutes: number | null;
  base_amount_cents: string | null;
  discount_cents: string | null;
  surcharge_cents: string | null;
  final_amount_cents: string | null;
  method_name: string | null;
  tariff_snapshot: Record<string, unknown> | null;
  entry_notes: string | null;
}

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error((data?.error as string) ?? `Error ${res.status}`);
  return data ?? {};
}

async function fetchPayload(sessionId: string): Promise<SessionTicketPayload> {
  const data = await api("GET", `/api/sessions/${sessionId}`);
  return (data as { session: SessionTicketPayload }).session;
}

/** Desglose desde el snapshot tarifario (formato calc_fee_breakdown). */
function breakdownLines(snapshot: Record<string, unknown> | null, baseCents: number) {
  const lines: { label: string; amountCents: number }[] = [];
  if (snapshot) {
    const items = (snapshot.items ?? snapshot.lines) as
      | { label?: string; description?: string; amount_cents?: number; subtotal_cents?: number }[]
      | undefined;
    if (Array.isArray(items)) {
      for (const it of items) {
        const amount = it.amount_cents ?? it.subtotal_cents;
        if (typeof amount === "number") {
          lines.push({ label: it.label ?? it.description ?? "-", amountCents: amount });
        }
      }
    }
  }
  if (lines.length === 0 && baseCents > 0) {
    lines.push({ label: "Estadia", amountCents: baseCents });
  }
  return lines;
}

/**
 * Imprime el ticket de una estadía. Modos:
 *  - entry: comprobante de ingreso (estadía abierta, flujo de ingreso)
 *  - exit:  comprobante de pago (estadía cerrada recién, flujo de egreso)
 *  - reprint: desde historial; usa el layout que corresponda con marca REIMPRESION
 * Crea el print_job, intenta imprimir y marca el resultado en el MISMO job.
 */
export async function printSessionTicket(
  sessionId: string,
  mode: "entry" | "exit" | "reprint",
): Promise<{ jobId: string }> {
  const printKind = mode === "entry" ? "entry" : "reprint";
  const { id: jobId } = (await api("POST", "/api/print-jobs", {
    sessionId,
    kind: printKind,
  })) as { id: string };
  try {
    const s = await fetchPayload(sessionId);
    const bytes =
      s.status === "open"
        ? buildEntryTicket({
            parkingName: PARKING_NAME,
            ticketNumber: Number(s.ticket_number),
            plate: s.plate ?? "",
            vehicleType: s.vehicle_type_name,
            boxNumber: s.box_number,
            entryAt: s.entry_at,
            notes: s.entry_notes,
            reprint: mode === "reprint",
          })
        : buildExitReceipt({
            parkingName: PARKING_NAME,
            ticketNumber: Number(s.ticket_number),
            plate: s.plate ?? "",
            vehicleType: s.vehicle_type_name,
            boxNumber: s.box_number,
            entryAt: s.entry_at,
            exitAt: s.exit_at ?? s.entry_at,
            durationMinutes: s.duration_minutes ?? 0,
            breakdownLines: breakdownLines(s.tariff_snapshot, Number(s.base_amount_cents ?? 0)),
            totalCents: Number(s.final_amount_cents ?? s.base_amount_cents ?? 0),
            methodName: s.method_name ?? "-",
            reprint: mode === "reprint",
          });
    await printTicket(bytes);
    await api("PATCH", "/api/print-jobs", { id: jobId, status: "printed" });
    return { jobId };
  } catch (err) {
    await api("PATCH", "/api/print-jobs", {
      id: jobId,
      status: "error",
      lastError: err instanceof Error ? err.message : String(err),
    }).catch(() => undefined);
    throw err;
  }
}
