"use client";

import { useState } from "react";
import { PromptDialog } from "@/components/ui/dialog";

export interface MethodView {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

export function MethodsManager({ methods }: { methods: MethodView[] }) {
  const [list, setList] = useState(methods);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<MethodView | null>(null);

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

  async function reload() {
    const r = await call("/api/payment-methods", "GET", {});
    if (r?.methods) setList(r.methods);
  }

  async function createMethod() {
    const r = await call("/api/payment-methods", "POST", { code, name });
    if (!r) return;
    await reload();
    setCode("");
    setName("");
  }

  async function applyRename(value: string) {
    if (!renaming) return;
    const next = value.trim();
    if (!next || next === renaming.name) {
      setRenaming(null);
      return;
    }
    if (await call("/api/payment-methods", "PATCH", { id: renaming.id, name: next })) {
      setRenaming(null);
      await reload();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Medios de pago</h1>
        <p className="text-sm text-neutral-500">
          Medios con los que se cierran las estadías. Desactivar un medio no
          afecta los pagos históricos.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Nuevo medio de pago</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={inputCls} placeholder="Código (ej. EFE)" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
          <input className={inputCls} placeholder="Nombre (ej. Efectivo)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button className={btnCls} disabled={busy || !code.trim() || !name.trim()} onClick={createMethod}>
            Crear
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {list.map((m) => (
              <tr key={m.id} className={m.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{m.code}</td>
                <td className="px-4 py-2.5 text-neutral-200">{m.name}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="flex justify-end gap-1.5">
                    <button className={btnCls} disabled={busy} onClick={() => setRenaming(m)}>
                      Renombrar
                    </button>
                    <button
                      className={btnCls}
                      disabled={busy}
                      onClick={async () => {
                        if (await call("/api/payment-methods", "PATCH", { id: m.id, isActive: !m.is_active }))
                          await reload();
                      }}
                    >
                      {m.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <PromptDialog
        key={renaming?.id ?? "closed"}
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        onSubmit={applyRename}
        title="Renombrar medio de pago"
        description={
          <>
            El código{" "}
            <span className="font-mono text-neutral-200">{renaming?.code}</span> no
            cambia. El nombre es lo que ve el operador al cobrar.
          </>
        }
        label="Nombre"
        defaultValue={renaming?.name ?? ""}
        confirmLabel="Guardar nombre"
        busy={busy}
      />
    </div>
  );
}
