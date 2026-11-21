"use client";

import { useEffect, useState } from "react";
import { normalizePlate } from "@/lib/plate";

export interface SubscriptionView {
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

export interface MethodOpt {
  id: string;
  name: string;
}

export interface MonthlyPlan {
  id: string;
  kind: string;
  name: string;
  vehicle_type_name: string;
  amount_cents: string;
}

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
export function showDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Estado de la pantalla de abonados: carga, alta y cancelación con su API. */
export function useAbonados(methods: MethodOpt[]) {
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
  const [toCancel, setToCancel] = useState<SubscriptionView | null>(null);

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
      // El plan elegido puede desaparecer entre recargas: si ya no existe,
      // volvemos al primero de la lista nueva para no enviar un id viejo.
      setPlanId((prev) =>
        prev && monthly.some((p) => p.id === prev) ? prev : (monthly[0]?.id ?? ""),
      );
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

  async function confirmCancel() {
    const target = toCancel;
    if (!target) return;
    setToCancel(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id }),
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

  return {
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
  };
}
