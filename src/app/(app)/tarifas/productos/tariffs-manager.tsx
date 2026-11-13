"use client";

import { useState } from "react";
import { formatARS } from "@/lib/format";

export interface TariffView {
  id: string;
  code: string | null;
  name: string;
  vehicle_type_id: string;
  vehicle_type_name: string;
  duration_minutes: number;
  duration_mode: string;
  amount_cents: string;
  is_active: boolean;
}

interface VehicleTypeOpt {
  id: string;
  name: string;
}

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

const MODE_LABEL: Record<string, string> = {
  flat: "Fijo",
  per_block: "Por bloque",
  per_hour: "Por hora",
};

const centsToPesosInput = (cents: string) => (Number(cents) / 100).toFixed(2);

export function TariffsManager({
  tariffs,
  vehicleTypes,
}: {
  tariffs: TariffView[];
  vehicleTypes: VehicleTypeOpt[];
}) {
  const [list, setList] = useState(tariffs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vtId, setVtId] = useState(vehicleTypes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [minutes, setMinutes] = useState("");
  const [mode, setMode] = useState("flat");
  const [amount, setAmount] = useState("");

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
    const r = await call("/api/tariffs", "GET", {});
    if (r?.tariffs) setList(r.tariffs);
  }

  async function createTariff() {
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    const r = await call("/api/tariffs", "POST", {
      vehicleTypeId: vtId,
      name,
      code: code || undefined,
      durationMinutes: Number(minutes),
      durationMode: mode,
      amountCents: cents,
    });
    if (!r) return;
    await reload();
    setName("");
    setCode("");
    setMinutes("");
    setAmount("");
  }

  async function setAmountCents(id: string, currentCents: string) {
    const val = prompt(`Nuevo monto en pesos (actual: ${centsToPesosInput(currentCents)}):`) ?? "";
    if (val === "") return;
    const cents = Math.round(Number(val.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Monto inválido");
      return;
    }
    if (await call("/api/tariffs", "PATCH", { id, amountCents: cents })) await reload();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Productos tarifarios</h1>
        <p className="text-sm text-neutral-500">
          El cobro se calcula con la tarifa activa más ajustada a la estadía; los
          cobros históricos guardan su snapshot y no cambian al editar.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Nueva tarifa</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <select className={inputCls} value={vtId} onChange={(e) => setVtId(e.target.value)}>
            {vehicleTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <input className={inputCls} placeholder="Código (opc.)" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
          <input className={inputCls} placeholder="Minutos" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
          <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="flat">Fijo</option>
            <option value="per_block">Por bloque</option>
            <option value="per_hour">Por hora</option>
          </select>
          <input className={inputCls} placeholder="Monto ARS" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <button className={`${btnCls} mt-2`} disabled={busy || !name.trim() || !minutes || amount === ""} onClick={createTariff}>
          Crear tarifa
        </button>
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Duración</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {list.map((t) => (
              <tr key={t.id} className={t.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{t.code ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-200">{t.name}</td>
                <td className="px-4 py-2.5 text-neutral-400">{t.vehicle_type_name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">
                  {t.duration_minutes} min · {MODE_LABEL[t.duration_mode] ?? t.duration_mode}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-neutral-100">
                  {formatARS(t.amount_cents)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="flex justify-end gap-1.5">
                    <button className={btnCls} disabled={busy} onClick={() => setAmountCents(t.id, t.amount_cents)}>
                      Monto
                    </button>
                    <button className={btnCls} disabled={busy} onClick={async () => { if (await call("/api/tariffs", "PATCH", { id: t.id, isActive: !t.is_active })) await reload(); }}>
                      {t.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
