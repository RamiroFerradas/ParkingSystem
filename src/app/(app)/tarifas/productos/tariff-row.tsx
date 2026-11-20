"use client";

import { Fragment, useState } from "react";
import { formatARS } from "@/lib/format";
import { badgeCls, btnCls, inputCls } from "@/lib/ui-classes";
import { TextInput } from "@/components/ui/field";
import {
  centsToPesosInput,
  hoursLabel,
  localToIso,
  validityOf,
  type Call,
  type TariffView,
} from "./tariffs-types";

export function TariffRow({
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
  const [editingValidity, setEditingValidity] = useState(false);
  const [kind, setKind] = useState<"fixed" | "temp">(t.valid_to ? "temp" : "fixed");
  const [from, setFrom] = useState(t.valid_from_local);
  const [to, setTo] = useState(t.valid_to_local ?? "");
  const [rowError, setRowError] = useState<string | null>(null);

  const validity = validityOf(t);
  // Comparar una fecha guardada con "ahora" es intencionalmente impuro: el
  // estado de vencimiento depende del reloj, no de un valor estable de render.
  // eslint-disable-next-line react-hooks/purity
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

  async function saveValidity() {
    setRowError(null);
    const payload: Record<string, unknown> = { id: t.id };
    if (kind === "fixed") {
      // Volver a fija: arranca ahora y no vence.
      payload.validFrom = new Date().toISOString();
      payload.validTo = null;
    } else {
      if (!from || !to) {
        setRowError("Completá desde y hasta");
        return;
      }
      const fromIso = localToIso(from);
      const toIso = localToIso(to);
      if (new Date(toIso) <= new Date(fromIso)) {
        setRowError("La vigencia debe terminar después de empezar");
        return;
      }
      payload.validFrom = fromIso;
      payload.validTo = toIso;
    }
    if (await call("/api/tariffs", "PATCH", payload)) {
      setEditingValidity(false);
      await reload();
    }
  }

  return (
    <Fragment>
      <tr className={t.is_active && !expired ? "" : "opacity-50"}>
        <td className="px-4 py-2.5 tabular-nums text-neutral-300">{hoursLabel(t.duration_minutes)}</td>
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
              <button className={btnCls} disabled={busy} onClick={() => setEditingValidity((v) => !v)}>
                Vigencia
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
        </td>
      </tr>
      {editingValidity && (
        <tr>
          <td colSpan={5} className="bg-neutral-900/50 px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
                Vigencia
                <select
                  className={inputCls}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "fixed" | "temp")}
                >
                  <option value="fixed">Fija (sin vencimiento)</option>
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
              <button className={btnCls} disabled={busy} onClick={saveValidity}>
                {busy ? "Guardando…" : "Guardar vigencia"}
              </button>
              <button className={btnCls} disabled={busy} onClick={() => setEditingValidity(false)}>
                Cancelar
              </button>
              {rowError && <p className="w-full text-xs text-red-400">{rowError}</p>}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
