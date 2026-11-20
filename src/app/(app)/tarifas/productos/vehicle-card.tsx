"use client";

import { useState } from "react";
import { btnCls, inputCls } from "@/lib/ui-classes";
import { TextInput } from "@/components/ui/field";
import { MonthlyPlans } from "./monthly-plans";
import { TariffRow } from "./tariff-row";
import {
  isHourly,
  isMonthly,
  localToIso,
  type Call,
  type TariffView,
  type VehicleTypeOpt,
} from "./tariffs-types";

export function VehicleCard({
  vt,
  rows,
  busy,
  call,
  reload,
}: {
  vt: VehicleTypeOpt;
  rows: TariffView[];
  busy: boolean;
  call: Call;
  reload: () => Promise<void>;
}) {
  const [hours, setHours] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"fixed" | "temp">("fixed");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const hourly = rows.filter(isHourly);
  const monthly = rows.filter(isMonthly);

  const canCreate =
    hours !== "" && amount !== "" && (kind === "fixed" || (from !== "" && to !== ""));

  async function create() {
    setFormError(null);
    const minutes = Math.round(Number(hours.replace(",", ".")) * 60);
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setFormError("Horas inválidas");
      return;
    }
    if (!Number.isFinite(cents) || cents < 0) {
      setFormError("Monto inválido");
      return;
    }
    const payload: Record<string, unknown> = {
      vehicleTypeId: vt.id,
      durationMinutes: minutes,
      amountCents: cents,
    };
    if (kind === "temp") {
      const fromIso = localToIso(from);
      const toIso = localToIso(to);
      if (new Date(toIso) <= new Date(fromIso)) {
        setFormError("La vigencia debe terminar después de empezar");
        return;
      }
      payload.validFrom = fromIso;
      payload.validTo = toIso;
    }
    if (!(await call("/api/tariffs", "POST", payload))) return;
    setHours("");
    setAmount("");
    setKind("fixed");
    setFrom("");
    setTo("");
    await reload();
  }

  return (
    <section className="scroll-x rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
        <h2 className="text-sm font-medium text-neutral-200">{vt.name}</h2>
        <span className="text-xs text-neutral-500">
          {hourly.length} bloque{hourly.length === 1 ? "" : "s"}
        </span>
      </div>

      {hourly.length === 0 ? (
        <p className="px-4 py-3 text-sm text-neutral-500">
          Sin bloques cargados: agregá el primero abajo.
        </p>
      ) : (
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-neutral-900/60 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Bloque</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 font-medium">Vigencia</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {hourly.map((t) => (
              <TariffRow key={t.id} t={t} busy={busy} call={call} reload={reload} />
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-800 bg-neutral-900/40 px-4 py-3">
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Horas
          <TextInput
            className="w-24"
            placeholder="1"
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Monto ARS
          <TextInput
            className="w-32"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Vigencia
          <select
            className={inputCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as "fixed" | "temp")}
          >
            <option value="fixed">Fija</option>
            <option value="temp">Temporal</option>
          </select>
        </label>
        {kind === "temp" && (
          <>
            <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
              Desde
              <TextInput
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
              Hasta
              <TextInput
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button className={btnCls} disabled={busy || !canCreate} onClick={create}>
          {busy ? "Guardando…" : "Agregar bloque"}
        </button>
        {formError && <p className="w-full text-xs text-red-400">{formError}</p>}
      </div>

      <MonthlyPlans
        vehicleTypeId={vt.id}
        plans={monthly}
        busy={busy}
        call={call}
        reload={reload}
      />
    </section>
  );
}
