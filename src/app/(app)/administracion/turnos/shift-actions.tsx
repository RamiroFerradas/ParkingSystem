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
}

export function ShiftActions({ open, canClose = true, openedByName }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (open && !canClose) {
    return (
      <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">
        Solo {openedByName ?? "quien abrió el turno"} puede cerrar este turno. Pedile
        que lo cierre.
      </p>
    );
  }

  async function submit(action: "open" | "close", event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/shifts/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar la operación");
        return;
      }
      setNotes("");
      toast(action === "open" ? "Turno abierto" : "Turno cerrado");
      router.refresh();
    } catch {
      setError("Servidor no disponible");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => submit(open ? "close" : "open", e)} className="space-y-3">
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
  );
}
