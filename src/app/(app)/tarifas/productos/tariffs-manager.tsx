"use client";

import { Fragment, useState } from "react";
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
  valid_from: string;
  valid_to: string | null;
  // Hora local de Córdoba ya formateada para `datetime-local` (la calcula la
  // base): evita diferencias entre el server y el navegador.
  valid_from_local: string;
  valid_to_local: string | null;
}

interface VehicleTypeOpt {
  id: string;
  name: string;
}

type Call = (
  url: string,
  method: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";
const badgeCls = "rounded-full border px-2 py-0.5 text-[11px] font-medium";

const ART_OFFSET = "-03:00"; // Córdoba, sin horario de verano.

const hoursLabel = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;

const centsToPesosInput = (cents: string) => (Number(cents) / 100).toFixed(2);

/** `datetime-local` (hora Córdoba) → ISO. */
const localToIso = (value: string) => new Date(`${value}:00${ART_OFFSET}`).toISOString();

function validityOf(t: TariffView) {
  if (!t.valid_to) return { text: "Fija", cls: "border-neutral-700 text-neutral-400" };
  const now = Date.now();
  const from = new Date(t.valid_from).getTime();
  const to = new Date(t.valid_to).getTime();
  if (to <= now) return { text: "Vencida", cls: "border-neutral-700 text-neutral-500" };
  if (from > now) return { text: "Programada", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
  return { text: "Temporal", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
}

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
    if (Array.isArray(r?.tariffs)) setList(r.tariffs as TariffView[]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Tarifas por vehículo</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cada tipo de vehículo tiene sus bloques por hora. La vigencia{" "}
          <span className="text-amber-300">Temporal</span> reemplaza al bloque fijo de la
          misma duración mientras está activa; al vencer vuelve la fija. Los cobros ya
          realizados no cambian.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Tipo de vehículo
        </p>
        <nav aria-label="Tipo de vehículo" className="flex flex-wrap gap-1.5">
          {vehicleTypes.map((vt) => {
            const count = list.filter((t) => t.vehicle_type_id === vt.id).length;
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

function VehicleCard({
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
    <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
        <h2 className="text-sm font-medium text-neutral-200">{vt.name}</h2>
        <span className="text-xs text-neutral-500">
          {rows.length} bloque{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-neutral-500">
          Sin bloques cargados: agregá el primero abajo.
        </p>
      ) : (
        <table className="w-full text-sm">
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
            {rows.map((t) => (
              <TariffRow key={t.id} t={t} busy={busy} call={call} reload={reload} />
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-800 bg-neutral-900/40 px-4 py-3">
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Horas
          <input
            className={`${inputCls} w-24`}
            placeholder="1"
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Monto ARS
          <input
            className={`${inputCls} w-32`}
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
              <input
                type="datetime-local"
                className={inputCls}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
              Hasta
              <input
                type="datetime-local"
                className={inputCls}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button className={btnCls} disabled={busy || !canCreate} onClick={create}>
          Agregar bloque
        </button>
        {formError && <p className="w-full text-xs text-red-400">{formError}</p>}
      </div>
    </section>
  );
}

function TariffRow({
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
            <input
              className={`${inputCls} w-28 text-right`}
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
                Guardar
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
                    <input
                      type="datetime-local"
                      className={inputCls}
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
                    Hasta
                    <input
                      type="datetime-local"
                      className={inputCls}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button className={btnCls} disabled={busy} onClick={saveValidity}>
                Guardar vigencia
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
