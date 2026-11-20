"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BranchForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "No se pudo crear la sucursal");
        return;
      }
      setName("");
      setCode("");
      router.refresh();
    } catch {
      setError("No se pudo crear la sucursal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs font-medium text-neutral-500">Nueva sucursal</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Nombre</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sucursal Norte"
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Código (opcional)</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="NORTE"
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {busy ? "Creando…" : "Crear sucursal"}
      </button>
    </form>
  );
}
