"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { btnCls, inputCls } from "@/lib/ui-classes";

interface TypeRow {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export function TypesManager({ types }: { types: TypeRow[] }) {
  const [list, setList] = useState(types);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function call(url: string, method: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Error ${res.status}`);
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function createType() {
    const r = await call("/api/vehicle-types", "POST", { name, sortOrder: list.length + 1 });
    if (!r?.type) return;
    setList((prev) => [...prev, r.type]);
    setName("");
  }

  async function patchType(id: string, body: Record<string, unknown>) {
    const r = await call("/api/vehicle-types", "PATCH", { id, ...body });
    if (!r?.type) return;
    setList((prev) => prev.map((t) => (t.id === id ? r.type : t)));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Tipos de vehículos</h1>
        <p className="text-sm text-neutral-500">
          Los tipos alimentan el tarifario y la clasificación de estadías.
        </p>
      </header>

      {error && <Alert>{error}</Alert>}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Nuevo tipo</h2>
        <div className="mt-3 flex gap-2">
          <input
            className={inputCls + " flex-1"}
            placeholder="Nombre (ej: Camioneta)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <button
            className={btnCls}
            disabled={busy || !name.trim()}
            onClick={createType}
          >
            {busy ? "Creando…" : "Crear"}
          </button>
        </div>
      </section>

      <section className="scroll-x rounded-xl border border-neutral-800">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 text-right font-medium">Orden</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {list.map((t) => (
              <tr key={t.id} className={t.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-2.5">
                  <input
                    className="w-full max-w-48 rounded border border-transparent bg-transparent px-1 py-0.5 text-neutral-200 hover:border-neutral-700 focus:border-neutral-500 focus:bg-neutral-950 focus:outline-none"
                    defaultValue={t.name}
                    maxLength={40}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.name) patchType(t.id, { name: v });
                    }}
                  />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{t.sort_order}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    className={btnCls}
                    disabled={busy}
                    onClick={() => patchType(t.id, { isActive: !t.is_active })}
                  >
                    {t.is_active ? "Desactivar" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-neutral-600">
        Editá el nombre inline (se guarda al salir del campo). Un tipo con
        vehículos asociados no se puede desactivar.
      </p>
    </div>
  );
}
