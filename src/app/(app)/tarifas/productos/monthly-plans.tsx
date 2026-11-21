"use client";

import { useState } from "react";
import { formatARS } from "@/lib/format";
import { badgeCls, btnCls, inputCls } from "@/lib/ui-classes";
import { TextInput } from "@/components/ui/field";
import {
  centsToPesosInput,
  localToIso,
  validityOf,
  type Call,
  type TariffView,
} from "./tariffs-types";

function MonthlyPlanRow({
  t,
  busy,
  call,
  reload,
}: {
  t: TariffView;
  busy: boolean;
  call: Call;
  reload: () => Promise<void>;
}) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amount, setAmount] = useState(centsToPesosInput(t.amount_cents));
  const [rowError, setRowError] = useState<string | null>(null);

  const validity = validityOf(t);
  // eslint-disable-next-line react-hooks/purity -- el vencimiento depende del reloj
  const expired = t.valid_to !== null && new Date(t.valid_to).getTime() <= Date.now();

  async function saveAmount() {
    setRowError(null);
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setRowError("Monto inválido");
      return;
    }
    if (await call("/api/tariffs", "PATCH", { id: t.id, amountCents: cents })) {
      setEditingAmount(false);
      await reload();
    }
  }

  return (
    <tr className={t.is_active && !expired ? "" : "opacity-50"}>
      <td className="px-4 py-2.5 text-neutral-300">{t.name}</td>
      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-neutral-100">
        {editingAmount ? (
          <TextInput
            className="w-28 text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
          />
        ) : (
          formatARS(t.amount_cents)
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`${badgeCls} ${validity.cls}`}>{validity.text}</span>
        {t.valid_to_local && (
          <div className="mt-1 text-[11px] text-neutral-500">
            {t.valid_from_local.replace("T", " ")} → {t.valid_to_local.replace("T", " ")}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-neutral-400">
        {t.is_active ? "Activo" : "Inactivo"}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editingAmount ? (
          <span className="flex justify-end gap-1.5">
            <button className={btnCls} disabled={busy} onClick={saveAmount}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button
              className={btnCls}
              disabled={busy}
              onClick={() => {
                setAmount(centsToPesosInput(t.amount_cents));
                setEditingAmount(false);
              }}
            >
              Cancelar
            </button>
          </span>
        ) : (
          <span className="flex justify-end gap-1.5">
            <button
              className={btnCls}
              disabled={busy}
              onClick={() => {
                setAmount(centsToPesosInput(t.amount_cents));
                setEditingAmount(true);
              }}
            >
              Monto
            </button>
            <button
              className={btnCls}
              disabled={busy}
              onClick={async () => {
                if (await call("/api/tariffs", "PATCH", { id: t.id, isActive: !t.is_active })) {
                  await reload();
                }
              }}
            >
              {t.is_active ? "Desactivar" : "Activar"}
            </button>
          </span>
        )}
        {rowError && <p className="text-xs text-red-400">{rowError}</p>}
      </td>
    </tr>
  );
}

export function MonthlyPlans({
  vehicleTypeId,
  plans,
  busy,
  call,
  reload,
}: {
  vehicleTypeId: string;
  plans: TariffView[];
  busy: boolean;
  call: Call;
  reload: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"fixed" | "temp">("fixed");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const canCreate = amount !== "" && (kind === "fixed" || (from !== "" && to !== ""));

  async function create() {
    setFormError(null);
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setFormError("Monto inválido");
      return;
    }
    const payload: Record<string, unknown> = {
      vehicleTypeId,
      kind: "monthly",
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
    setAmount("");
    setKind("fixed");
    setFrom("");
    setTo("");
    await reload();
  }

  return (
    <div className="border-t border-neutral-800">
      <div className="flex items-center justify-between bg-neutral-900 px-4 py-2.5">
        <h3 className="text-sm font-medium text-neutral-200">Abono mensual</h3>
        <span className="text-xs text-neutral-500">
          {plans.length} plan{plans.length === 1 ? "" : "es"}
        </span>
      </div>

      {plans.length === 0 ? (
        <p className="px-4 py-3 text-sm text-neutral-500">
          Sin abonos cargados para este tipo de vehículo.
        </p>
      ) : (
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-neutral-900/60 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 font-medium">Vigencia</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {plans.map((t) => (
              <MonthlyPlanRow key={t.id} t={t} busy={busy} call={call} reload={reload} />
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-800 bg-neutral-900/40 px-4 py-3">
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
          {busy ? "Guardando…" : "Agregar abono"}
        </button>
        {formError && <p className="w-full text-xs text-red-400">{formError}</p>}
      </div>
    </div>
  );
}
