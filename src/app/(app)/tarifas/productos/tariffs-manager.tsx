"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { VehicleCard } from "./vehicle-card";
import { isHourly, type TariffView, type VehicleTypeOpt } from "./tariffs-types";

export type { TariffView };

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
  const [activeTypeId, setActiveTypeId] = useState(vehicleTypes[0]?.id ?? "");

  const activeType = vehicleTypes.find((vt) => vt.id === activeTypeId) ?? vehicleTypes[0];

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
        cache: "no-store",
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
      const r = await call("/api/tariffs", "GET");
      if (Array.isArray(r?.tariffs)) setList(r.tariffs as TariffView[]);
    } catch {
      setError("Sin conexión con el servidor");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Tarifas por vehículo</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cada tipo de vehículo tiene sus bloques por hora y su abono mensual. La vigencia{" "}
          <span className="text-amber-300">Temporal</span> reemplaza al bloque fijo de la
          misma duración mientras está activa; al vencer vuelve la fija. Los cobros ya
          realizados no cambian.
        </p>
      </header>

      {error && <Alert>{error}</Alert>}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Tipo de vehículo
        </p>
        <nav aria-label="Tipo de vehículo" className="flex flex-wrap gap-1.5">
          {vehicleTypes.map((vt) => {
            const count = list.filter(
              (t) => t.vehicle_type_id === vt.id && isHourly(t),
            ).length;
            const selected = vt.id === activeType?.id;
            return (
              <button
                key={vt.id}
                type="button"
                aria-pressed={selected}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? "border-neutral-100 bg-neutral-100 font-medium text-neutral-900"
                    : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                }`}
                onClick={() => setActiveTypeId(vt.id)}
              >
                {vt.name}
                <span className={`ml-1.5 text-[11px] ${selected ? "opacity-60" : "text-neutral-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {activeType && (
        <VehicleCard
          key={activeType.id}
          vt={activeType}
          rows={list.filter((t) => t.vehicle_type_id === activeType.id)}
          busy={busy}
          call={call}
          reload={reload}
        />
      )}
    </div>
  );
}
