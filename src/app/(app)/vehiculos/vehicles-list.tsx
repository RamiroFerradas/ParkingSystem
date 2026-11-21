"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate, formatTime } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { inputClsFull } from "@/lib/ui-classes";

interface VehicleRow {
  id: string;
  plate: string | null;
  plate_is_placeholder: boolean;
  type_name: string;
  notes: string | null;
  sessions_count: number;
  last_seen_at: string | null;
}

export function VehiclesList() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<VehicleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sólo la última búsqueda puede escribir el estado: con tecleo rápido las
  // respuestas pueden llegar desordenadas y una vieja pisaría a la nueva.
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/vehicles?q=${encodeURIComponent(q)}&limit=100`);
        const data = await res.json();
        if (seq !== requestSeq.current) return;
        if (!res.ok) {
          setError(data.error ?? `Error ${res.status}`);
          return;
        }
        setError(null);
        setRows(data.vehicles);
      } catch {
        if (seq === requestSeq.current) setError("Sin conexión con el servidor");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Vehículos</h1>
        <p className="text-sm text-neutral-500">
          Registrados automáticamente al primer ingreso. Buscá por patente o nota.
        </p>
      </header>

      <input
        className={inputClsFull}
        placeholder="Buscar patente…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && <Alert>{error}</Alert>}

      {rows && rows.length === 0 && (
        <p className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-6 text-center text-sm text-neutral-500">
          Sin resultados
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="scroll-x rounded-xl border border-neutral-800">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Patente</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Nota</th>
                <th className="px-4 py-2 text-right font-medium">Estadías</th>
                <th className="px-4 py-2 text-right font-medium">Último ingreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2.5 font-mono font-semibold text-neutral-100">
                    {v.plate ?? "(sin patente)"}
                    {v.plate_is_placeholder && (
                      <span className="ml-2 text-[10px] text-amber-400">provisoria</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-300">{v.type_name}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{v.notes ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                    {v.sessions_count}
                  </td>
                  <td className="px-4 py-2.5 text-right text-neutral-400">
                    {v.last_seen_at ? `${formatDate(v.last_seen_at)} ${formatTime(v.last_seen_at)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
