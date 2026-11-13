"use client";

import { useCallback, useEffect, useState } from "react";
import { printSessionTicket } from "@/lib/print/client";

interface PendingJob {
  id: string;
  session_id: string;
  kind: string;
  attempts: number;
  last_error: string | null;
  ticket_number: string;
  plate: string | null;
}

/** Cola de impresión con reintentos: reintentar SIEMPRE marca el mismo job (F2). */
export function PrintQueuePanel({ refreshKey }: { refreshKey?: number }) {
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [pending, failed] = await Promise.all([
        fetch("/api/print-jobs?status=pending").then((r) => r.json()),
        fetch("/api/print-jobs?status=error").then((r) => r.json()),
      ]);
      setJobs([...(pending.jobs ?? []), ...(failed.jobs ?? [])]);
    } catch {
      setError("No se pudo cargar la cola de impresión");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  async function retry(job: PendingJob) {
    setBusyId(job.id);
    setError(null);
    try {
      await printSessionTicket(job.session_id, job.kind === "entry" ? "entry" : "reprint");
      await reload();
    } catch (err) {
      setError(
        err instanceof Error ? `Sigue pendiente: ${err.message}` : "Sigue pendiente el reintento",
      );
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="text-sm font-medium text-neutral-300">
        Tickets pendientes de impresión
      </h2>
      {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
      {jobs.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-500">Sin tickets pendientes.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-800 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="text-neutral-200">
                  Ticket {j.ticket_number} · {j.plate ?? "—"}
                  {j.attempts > 1 && (
                    <span className="ml-2 text-xs text-amber-400">
                      intento {j.attempts}
                    </span>
                  )}
                </p>
                {j.last_error && (
                  <p className="text-xs text-red-400">{j.last_error}</p>
                )}
              </div>
              <button
                type="button"
                disabled={busyId === j.id}
                onClick={() => retry(j)}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
              >
                {busyId === j.id ? "Imprimiendo..." : "Imprimir"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
