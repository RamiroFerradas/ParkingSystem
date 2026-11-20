"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { printSessionTicket } from "@/lib/print/client";
import { formatARS, formatElapsed } from "@/lib/format";

export interface FeeBreakdown {
  block: { name: string; amount_cents: number } | null;
  extra_hours: number;
  hourly_amount_cents: number;
  total_cents: number;
  abono?: boolean;
}

export interface EgresoData {
  sessionId: string;
  ticketNumber: string;
  plate: string;
  vehicleTypeName: string;
  boxNumber: string;
  entryAt: string;
  elapsedMinutes: number;
  quote: FeeBreakdown;
  methods: { id: string; name: string }[];
  keyLeft: boolean;
  damageNotes: string | null;
}

type Result =
  | { state: "form" }
  | { state: "submitting" }
  | { state: "done"; finalCents: number; durationMinutes: number }
  | { state: "error"; message: string };

export function EgresoForm({ data }: { data: EgresoData }) {
  const [methodId, setMethodId] = useState(
    data.quote.abono ? data.methods[0]?.id ?? "" : "",
  );
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<Result>({ state: "form" });
  const [printState, setPrintState] = useState<
    { state: "idle" } | { state: "printing" } | { state: "ok" } | { state: "fail"; message: string }
  >({ state: "idle" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setResult({ state: "submitting" });
    try {
      const res = await fetch("/api/sessions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: data.sessionId, methodId, notes }),
      });
      const resData = (await res.json()) as {
        error?: string;
        finalCents?: number;
        durationMinutes?: number;
      };
      if (!res.ok) {
        setResult({ state: "error", message: resData.error ?? "No se pudo registrar el cobro" });
        return;
      }
      setResult({
        state: "done",
        finalCents: resData.finalCents ?? 0,
        durationMinutes: resData.durationMinutes ?? 0,
      });
    } catch {
      setResult({
        state: "error",
        message: "Servidor no disponible. El cobro NO se registró.",
      });
    }
  }

  async function printReceipt() {
    setPrintState({ state: "printing" });
    try {
      await printSessionTicket(data.sessionId, "exit");
      setPrintState({ state: "ok" });
    } catch (err) {
      setPrintState({
        state: "fail",
        message: err instanceof Error ? err.message : "Fallo de impresión",
      });
    }
  }

  if (result.state === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="text-sm text-emerald-400">Cobro registrado</p>
        <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
          {formatARS(result.finalCents)}
        </p>
        <p className="mt-1 font-mono text-xs text-neutral-400">
          Ticket #{data.ticketNumber} · {formatElapsed(result.durationMinutes)} · Box liberado
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {printState.state !== "ok" ? (
            <button
              type="button"
              onClick={printReceipt}
              disabled={printState.state === "printing"}
              className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
            >
              {printState.state === "printing" ? "Imprimiendo..." : "Imprimir comprobante"}
            </button>
          ) : (
            <p className="text-sm text-emerald-400">Comprobante impreso</p>
          )}
        </div>
        {printState.state === "fail" && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            No se pudo imprimir ({printState.message}). El comprobante quedó en la cola
            de impresión de{" "}
            <Link href="/operaciones/ingreso" className="underline">
              registrar ingreso
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  const q = data.quote;

  return (
    <>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <p className="text-xs font-medium text-neutral-500">Desglose (BR-010)</p>
        {q.abono ? (
          <div className="mt-2 space-y-1.5 text-sm">
            <p className="text-emerald-400">Estadía abonada: no se cobra por hora.</p>
            <div className="flex justify-between border-t border-neutral-800 pt-1.5 font-medium">
              <span>Tiempo: {formatElapsed(data.elapsedMinutes)}</span>
              <span className="font-mono tabular-nums text-emerald-400">Abonado</span>
            </div>
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-neutral-300">{q.block?.name ?? "Tarifa"}</span>
              <span className="tabular-nums">{formatARS(q.block?.amount_cents ?? 0)}</span>
            </li>
            {q.extra_hours > 0 ? (
              <li className="flex justify-between">
                <span className="text-neutral-300">
                  {q.extra_hours} × hora extra ({formatARS(q.hourly_amount_cents)} c/u)
                </span>
                <span className="tabular-nums">
                  {formatARS(q.extra_hours * q.hourly_amount_cents)}
                </span>
              </li>
            ) : null}
            <li className="flex justify-between border-t border-neutral-800 pt-1.5 font-medium">
              <span>Tiempo: {formatElapsed(data.elapsedMinutes)}</span>
              <span className="font-mono tabular-nums text-emerald-400">{formatARS(q.total_cents)}</span>
            </li>
          </ul>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <span className="block text-xs font-medium text-neutral-400">Medio de pago</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {data.methods.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm ${
                  methodId === m.id
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.id}
                  checked={methodId === m.id}
                  onChange={() => setMethodId(m.id)}
                  className="sr-only"
                  required
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-xs font-medium text-neutral-400">
            Observaciones (opcional)
          </label>
          <input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </div>

        {result.state === "error" ? (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {result.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={result.state === "submitting" || !methodId}
          className="w-full rounded-md bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {result.state === "submitting" ? "Cobrando..." : q.abono ? "Confirmar egreso" : `Confirmar cobro · ${formatARS(q.total_cents)}`}
        </button>
      </form>
    </>
  );
}
