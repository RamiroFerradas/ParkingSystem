"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatARS } from "@/lib/format";

interface SubscriptionView {
  id: string;
  plate: string;
  vehicle_type: string;
  plan_name: string;
  starts_on: string;
  ends_on: string;
  amount_cents: string;
  status: string;
  vigente: boolean;
  created_by_name: string;
  created_at: string;
  notes: string | null;
}

interface MethodOpt {
  id: string;
  name: string;
}

interface MonthlyPlan {
  id: string;
  kind: string;
  name: string;
  vehicle_type_name: string;
  amount_cents: string;
}

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";
const badgeCls = "rounded-full border px-2 py-0.5 text-[11px] font-medium";

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha local del navegador como YYYY-MM-DD (sin pasar por UTC). */
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function todayIso() {
  return isoDate(new Date());
}

function oneMonthLaterIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return isoDate(d);
}

/** YYYY-MM-DD → DD/MM/YYYY sin reinterpretar la fecha en UTC. */
function showDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

const normalizePlate = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

function stateOf(s: SubscriptionView) {
  if (s.status === "cancelled") {
    return { text: "Cancelado", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
  }
  if (s.vigente) {
    return { text: "Vigente", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };
  }
  return { text: "Vencido", cls: "border-neutral-700 text-neutral-400" };
}

export function AbonadosManager({ methods }: { methods: MethodOpt[] }) {
  const [list, setList] = useState<SubscriptionView[] | null>(null);
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);

  const [plate, setPlate] = useState("");
  const [planId, setPlanId] = useState("");
  const [startsOn, setStartsOn] = useState(todayIso);
  const [endsOn, setEndsOn] = useState(oneMonthLaterIso);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noShift, setNoShift] = useState(false);

  async function load() {
    const [subsRes, tariffsRes] = await Promise.all([
      fetch("/api/subscriptions", { cache: "no-store" }),
      fetch("/api/tariffs", { cache: "no-store" }),
    ]);
    const subsData = await subsRes.json().catch(() => null);
    const tariffsData = await tariffsRes.json().catch(() => null);

    if (!subsRes.ok) {
      setError(subsData?.error ?? `Error ${subsRes.status}`);
    } else if (Array.isArray(subsData?.subscriptions)) {
      setList(subsData.subscriptions as SubscriptionView[]);
      setError(null);
    }

    if (tariffsRes.ok && Array.isArray(tariffsData?.tariffs)) {
      const monthly = (tariffsData.tariffs as MonthlyPlan[]).filter((t) => t.kind === "monthly");
      setPlans(monthly);
      setPlanId((prev) => prev || monthly[0]?.id || "");
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch {
        if (alive) setError("Sin conexión con el servidor");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    setError(null);
    setNoShift(false);
    const normalized = normalizePlate(plate);
    if (!normalized) {
      setError("Ingresá una patente");
      return;
    }
    if (!planId) {
      setError("Elegí el plan mensual");
      return;
    }
    if (!methodId) {
      setError("Elegí el medio de pago");
      return;
    }
    if (!startsOn || !endsOn) {
      setError("Completá desde y hasta");
      return;
    }
    if (endsOn < startsOn) {
      setError("El fin debe ser posterior al inicio");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: normalized,
          tariffId: planId,
          startsOn,
          endsOn,
          methodId,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && data?.code === "NO_OPEN_SHIFT") {
          setNoShift(true);
          setError(data?.error ?? "Abrí un turno de caja antes de cobrar un abono.");
          return;
        }
        setError(data?.error ?? `Error ${res.status}`);
        return;
      }
      setPlate("");
      setNotes("");
      await load();
    } catch {
      setError("Sin conexión con el servidor");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(s: SubscriptionView) {
    // eslint-disable-next-line no-alert -- confirmación nativa simple, sin modal propio
    if (!window.confirm(`¿Cancelar el abono de ${s.plate}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Error ${res.status}`);
        return;
      }
      await load();
    } catch {
      setError("Sin conexión con el servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Abonados</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Abonos mensuales por patente. El cobro se registra en el turno de caja abierto.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
          {noShift && (
            <>
              {" "}
              <Link href="/administracion/turnos" className="text-amber-300 underline">
                Ir a turnos
              </Link>
            </>
          )}
        </p>
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

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Patente
            <input
              className={`${inputCls} font-mono uppercase`}
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
            <input
              type="date"
              className={inputCls}
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Hasta
            <input
              type="date"
              className={inputCls}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
            Notas
            <input
              className={inputCls}
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
          Registrar abono
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
                      <span className={`${badgeCls} ${state.cls}`}>{state.text}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="flex justify-end">
                        <button
                          className={btnCls}
                          disabled={busy || s.status !== "active"}
                          onClick={() => cancel(s)}
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
    </div>
  );
}
