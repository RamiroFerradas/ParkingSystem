"use client";

import Link from "next/link";
import { formatARS } from "@/lib/format";
import { btnCls, inputCls } from "@/lib/ui-classes";
import { Alert } from "@/components/ui/alert";
import { TextInput } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { ConfirmDialog } from "@/components/ui/dialog";
import { showDate, useAbonados, type MethodOpt, type SubscriptionView } from "./use-abonados";

function stateOf(s: SubscriptionView) {
  if (s.status === "cancelled") {
    return { text: "Cancelado", tone: "amber" as const };
  }
  if (s.vigente) {
    return { text: "Vigente", tone: "green" as const };
  }
  return { text: "Vencido", tone: "neutral" as const };
}

export function AbonadosManager({ methods }: { methods: MethodOpt[] }) {
  const {
    list,
    plans,
    plate,
    setPlate,
    planId,
    setPlanId,
    startsOn,
    setStartsOn,
    endsOn,
    setEndsOn,
    methodId,
    setMethodId,
    notes,
    setNotes,
    busy,
    loading,
    error,
    noShift,
    toCancel,
    setToCancel,
    create,
    confirmCancel,
  } = useAbonados(methods);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Abonados</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Abonos mensuales por patente. El cobro se registra en el turno de caja abierto.
        </p>
      </header>

      {error && (
        <Alert>
          {error}
          {noShift && (
            <>
              {" "}
              <Link href="/administracion/turnos" className="text-amber-300 underline">
                Ir a turnos
              </Link>
            </>
          )}
        </Alert>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Nuevo abono</h2>

        {plans.length === 0 && !loading && (
          <p className="mt-2 text-xs text-amber-300">
            No hay planes mensuales cargados.{" "}
            <Link href="/tarifas/productos" className="underline">
              Crear un plan
            </Link>
          </p>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Patente
            <TextInput
              className="font-mono uppercase"
              placeholder="AAA123"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              maxLength={10}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Plan mensual
            <select
              className={inputCls}
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={plans.length === 0}
            >
              {plans.length === 0 ? (
                <option value="">Sin planes</option>
              ) : (
                plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.vehicle_type_name} · {p.name} · {formatARS(p.amount_cents)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Medio de pago
            <select
              className={inputCls}
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
            >
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Desde
            <TextInput
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Hasta
            <TextInput
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Notas
            <TextInput
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
            />
          </label>
        </div>

        <button
          className={`${btnCls} mt-3`}
          disabled={busy || plans.length === 0}
          onClick={create}
        >
          {busy ? "Registrando…" : "Registrar abono"}
        </button>
      </section>

      {loading && <p className="text-sm text-neutral-500">Cargando abonos…</p>}

      {!loading && list && list.length === 0 && (
        <p className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no hay abonos registrados.
        </p>
      )}

      {!loading && list && list.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Patente</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Período</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {list.map((s) => {
                const state = stateOf(s);
                return (
                  <tr key={s.id} className={s.status === "cancelled" ? "opacity-50" : ""}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-neutral-100">
                      {s.plate}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-300">{s.vehicle_type}</td>
                    <td className="px-4 py-2.5 text-neutral-300">
                      {s.plan_name}
                      {s.notes && <div className="text-[11px] text-neutral-500">{s.notes}</div>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-neutral-400">
                      {showDate(s.starts_on)} → {showDate(s.ends_on)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-neutral-100">
                      {formatARS(s.amount_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={state.tone}>{state.text}</StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="flex justify-end">
                        <button
                          className={btnCls}
                          disabled={busy || s.status !== "active"}
                          onClick={() => setToCancel(s)}
                        >
                          Cancelar
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
        title="Cancelar abono"
        description={
          <>
            ¿Cancelar el abono de{" "}
            <span className="font-mono text-neutral-200">{toCancel?.plate}</span>? Deja de
            estar vigente; los cobros ya registrados no cambian.
          </>
        }
        confirmLabel="Cancelar abono"
        busy={busy}
      />
    </div>
  );
}
