"use client";

import { useEffect, useState } from "react";
import { formatDate, formatTime } from "@/lib/format";

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

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/vehicles?q=${encodeURIComponent(q)}&limit=100`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `Error ${res.status}`);
          return;
        }
        setError(null);
        setRows(data.vehicles);
      } catch {
        setError("Sin conexión con el servidor");
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
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
        placeholder="Buscar patente…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

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
