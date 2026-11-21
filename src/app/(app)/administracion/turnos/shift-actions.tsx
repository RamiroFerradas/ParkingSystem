"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useToast } from "@/components/shell/toast";

interface Props {
  /** true = hay turno abierto (mostrar cerrar); false = abrir turno */
  open: boolean;
  /** Admin/supervisor cierran cualquiera; el empleado, solo el que abrió. */
  canClose?: boolean;
  openedByName?: string | null;
  /** Vehículos del turno que siguen adentro (sin egreso). */
  openSessions?: number;
}

interface CloseErrorBody {
  error?: string;
  code?: string;
  openSessions?: number;
}

export function ShiftActions({
  open,
  canClose = true,
  openedByName,
  openSessions = 0,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [insideCount, setInsideCount] = useState(openSessions);

  if (open && !canClose) {
    return (
      <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">
        Solo {openedByName ?? "quien abrió el turno"} puede cerrar este turno. Pedile
        que lo cierre.
      </p>
    );
  }

  async function submit(action: "open" | "close", force = false) {
    setError(null);
    // Cerrar con autos adentro: primero se avisa y se pide confirmación.
    if (action === "close" && !force && (openSessions > 0 || insideCount > 0)) {
      setInsideCount(Math.max(openSessions, insideCount));
      setConfirming(true);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/shifts/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, ...(force ? { force: true } : {}) }),
      });
      const data = (await res.json()) as CloseErrorBody;
      if (!res.ok) {
        if (action === "close" && data.code === "SHIFT_HAS_OPEN_SESSIONS") {
          setInsideCount(Number(data.openSessions ?? 0));
          setConfirming(true);
          return;
        }
        setError(data.error ?? "No se pudo completar la operación");
        return;
      }
      setNotes("");
      setConfirming(false);
      if (action === "close" && force && insideCount > 0) {
        toast(`Turno cerrado con ${insideCount} auto${insideCount === 1 ? "" : "s"} adentro`);
      } else {
        toast(action === "open" ? "Turno abierto" : "Turno cerrado");
      }
      router.refresh();
    } catch {
      setError("Servidor no disponible");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="shift-notes" className="block text-xs font-medium text-neutral-400">
          {open ? "Notas de cierre (opcional)" : "Notas de apertura (opcional)"}
        </label>
        <input
          id="shift-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {open && confirming ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3">
          <p className="text-sm font-medium text-amber-300">
            Quedan {insideCount} auto{insideCount === 1 ? "" : "s"} adentro
          </p>
          <p className="mt-1 text-xs text-amber-200">
            Si cerrás el turno igual, esos vehículos siguen estacionados y sus cobros
            quedarán en el próximo turno que abras.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void submit("close", true)}
              className="rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {pending ? "Cerrando..." : "Cerrar turno igual"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              Volver
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void submit(open ? "close" : "open");
          }}
        >
          <button
            type="submit"
            disabled={pending}
            className={`w-full rounded-md px-3 py-2.5 text-sm font-semibold disabled:opacity-60 ${
              open
                ? "bg-amber-500 text-neutral-950 hover:bg-amber-400"
                : "bg-neutral-100 text-neutral-900 hover:bg-white"
            }`}
          >
            {pending ? "Procesando..." : open ? "Cerrar turno" : "Abrir turno"}
          </button>
        </form>
      )}
    </div>
  );
}
