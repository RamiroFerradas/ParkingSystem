"use client";

import { useState } from "react";
import { formatDate, formatTime } from "@/lib/format";

export interface SpecialView {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  vehicle_type_ids: string[];
  adjustment_type: string;
  adjustment_value: string;
  priority: number;
  status: string;
}

interface VehicleTypeOpt {
  id: string;
  name: string;
}

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  active: "Activo",
  expired: "Finalizado",
  cancelled: "Cancelado",
};

export function SpecialsManager({
  specials,
  vehicleTypes,
}: {
  specials: SpecialView[];
  vehicleTypes: VehicleTypeOpt[];
}) {
  const [list, setList] = useState(specials);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("percent");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [priority, setPriority] = useState("100");
  const [typeIds, setTypeIds] = useState<string[]>([]); // vacío = todos

  async function call(url: string, method: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      // El spec de fetch prohíbe body en GET/HEAD (el navegador lanza TypeError).
      const allowsBody = method !== "GET" && method !== "HEAD";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: allowsBody && body !== undefined ? JSON.stringify(body) : undefined,
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
    try {
      const r = await call("/api/special-tariffs", "GET");
      if (r?.specials) setList(r.specials);
    } catch {
      setError("Sin conexión con el servidor");
    }
  }

  async function createSpecial() {
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("El fin debe ser posterior al inicio");
      return;
    }
    // datetime-local es hora local (TZ del negocio); sin Z queda local en el server local
    const body: Record<string, unknown> = {
      name,
      startsAt: startsAt,
      endsAt: endsAt,
      adjustmentType,
      priority: Number(priority) || 100,
      vehicleTypeIds: typeIds,
    };
    if (adjustmentType === "percent") {
      body.adjustmentValue = Number(adjustmentValue.replace(",", "."));
    } else {
      body.adjustmentValue = Math.round(Number(adjustmentValue.replace(",", ".")) * 100);
    }
    const r = await call("/api/special-tariffs", "POST", body);
    if (!r) return;
    await reload();
    setName("");
    setStartsAt("");
    setEndsAt("");
    setAdjustmentValue("");
  }

  const canCancel = (s: SpecialView) => s.status === "scheduled" || s.status === "active";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Tarifas especiales</h1>
        <p className="text-sm text-neutral-500">
          Períodos con ajuste sobre el tarifario base (ej. feriados, eventos).
          Menor prioridad gana ante superposición.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Nuevo período</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input className={inputCls} placeholder="Nombre (ej. Feriado)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <label className="text-xs text-neutral-500">
            Desde
            <input className={`${inputCls} w-full`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="text-xs text-neutral-500">
            Hasta
            <input className={`${inputCls} w-full`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <select className={inputCls} value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value)}>
            <option value="percent">Recargo %</option>
            <option value="fixed_amount">Monto fijo (centavos)</option>
          </select>
          <input
            className={inputCls}
            placeholder={adjustmentType === "percent" ? "% (1-100)" : "Centavos"}
            value={adjustmentValue}
            onChange={(e) => setAdjustmentValue(e.target.value)}
            inputMode="decimal"
          />
          <input
            className={inputCls}
            placeholder="Prioridad (menor = mayor)"
            value={priority}
            onChange={(e) => setPriority(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <fieldset className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
          <legend className="sr-only">Tipos de vehículo</legend>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={typeIds.length === 0}
              onChange={() => setTypeIds([])}
            />
            Todos
          </label>
          {vehicleTypes.map((t) => (
            <label key={t.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={typeIds.includes(t.id)}
                onChange={(e) =>
                  setTypeIds((prev) =>
                    e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                  )
                }
              />
              {t.name}
            </label>
          ))}
        </fieldset>
        <button
          className={`${btnCls} mt-3`}
          disabled={busy || !name.trim() || !startsAt || !endsAt || !adjustmentValue}
          onClick={createSpecial}
        >
          {busy ? "Creando…" : "Crear período"}
        </button>
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Período</th>
              <th className="px-4 py-2 font-medium">Ajuste</th>
              <th className="px-4 py-2 text-right font-medium">Prioridad</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {list.map((s) => (
              <tr key={s.id} className={s.status === "cancelled" ? "opacity-50" : ""}>
                <td className="px-4 py-2.5 text-neutral-200">{s.name}</td>
                <td className="px-4 py-2.5 text-neutral-400">
                  {formatDate(s.starts_at)} {formatTime(s.starts_at)} → {formatDate(s.ends_at)}{" "}
                  {formatTime(s.ends_at)}
                </td>
                <td className="px-4 py-2.5 text-neutral-400">
                  {s.adjustment_type === "percent"
                    ? `+${Number(s.adjustment_value)}%`
                    : `+${(Number(s.adjustment_value) / 100).toFixed(2)} ARS`}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{s.priority}</td>
                <td className="px-4 py-2.5 text-neutral-300">{STATUS_LABEL[s.status] ?? s.status}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="flex justify-end">
                    <button
                      className={btnCls}
                      disabled={busy || !canCancel(s)}
                      onClick={async () => {
                        if (await call("/api/special-tariffs", "PATCH", { id: s.id, status: "cancelled" }))
                          await reload();
                      }}
                    >
                      Cancelar
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
