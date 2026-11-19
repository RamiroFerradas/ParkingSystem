"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { printSessionTicket, PARKING_NAME } from "@/lib/print/client";
import { normalizePlate } from "@/lib/plate";

interface Props {
  vehicleTypes: { id: string; name: string }[];
  availableBoxes: { id: string; number: string; floor_name: string }[];
}

type Status =
  | { step: "form" }
  | { step: "submitting" }
  | {
      step: "done";
      ticketNumber: number;
      sessionId: string;
      plate: string;
      vehicleTypeName: string;
      boxNumber: string;
    };

export function IngresoForm({ vehicleTypes, availableBoxes }: Props) {
  const [plate, setPlate] = useState("");
  const [lookup, setLookup] = useState<
    { state: "idle" } | { state: "found"; vehicleTypeName: string; vehicleTypeId: string } | { state: "new" }
  >({ state: "idle" });
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [boxId, setBoxId] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ step: "form" });
  const [printState, setPrintState] = useState<
    { state: "idle" } | { state: "printing" } | { state: "ok" } | { state: "fail"; message: string }
  >({ state: "idle" });

  // Mapa de boxes: filtro por número + agrupado por piso.
  const filter = boxFilter.trim().toLowerCase();
  const filteredBoxes = filter
    ? availableBoxes.filter((b) => b.number.toLowerCase().includes(filter))
    : availableBoxes;
  const boxesByFloor = new Map<string, typeof availableBoxes>();
  for (const box of filteredBoxes) {
    const list = boxesByFloor.get(box.floor_name) ?? [];
    list.push(box);
    boxesByFloor.set(box.floor_name, list);
  }

  async function lookupPlate(raw: string) {
    const plate = normalizePlate(raw);
    if (!plate) return;
    try {
      const res = await fetch(`/api/vehicles/lookup?plate=${encodeURIComponent(plate)}`);
      const data = (await res.json()) as {
        found: boolean;
        vehicleTypeId?: string;
        vehicleTypeName?: string;
      };
      if (data.found && data.vehicleTypeId && data.vehicleTypeName) {
        setLookup({ state: "found", vehicleTypeName: data.vehicleTypeName, vehicleTypeId: data.vehicleTypeId });
        setVehicleTypeId(data.vehicleTypeId);
      } else {
        setLookup({ state: "new" });
        setVehicleTypeId("");
      }
    } catch {
      setLookup({ state: "idle" });
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!boxId) {
      setError("Elegí un box para el ingreso");
      return;
    }
    setError(null);
    setStatus({ step: "submitting" });
    try {
      const res = await fetch("/api/sessions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: crypto.randomUUID(),
          plate,
          vehicleTypeId,
          boxId,
          notes,
        }),
      });
      const data = (await res.json()) as { error?: string; ticketNumber?: number; sessionId?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo registrar el ingreso");
        setStatus({ step: "form" });
        return;
      }
      setStatus({
        step: "done",
        ticketNumber: data.ticketNumber ?? 0,
        sessionId: data.sessionId ?? "",
        plate: plate.trim().toUpperCase(),
        vehicleTypeName: lookup.state === "found"
          ? lookup.vehicleTypeName
          : vehicleTypes.find((t) => t.id === vehicleTypeId)?.name ?? "",
        boxNumber: availableBoxes.find((b) => b.id === boxId)?.number ?? "",
      });
    } catch {
      setError("No se pudo conectar con el servidor. Intentá de nuevo.");
      setStatus({ step: "form" });
    }
  }

  async function printEntryTicket() {
    if (status.step !== "done") return;
    setPrintState({ state: "printing" });
    try {
      // el job usa el payload server-side; el form solo dispara la impresión
      await printSessionTicket(status.sessionId, "entry");
      setPrintState({ state: "ok" });
    } catch (err) {
      setPrintState({
        state: "fail",
        message: err instanceof Error ? err.message : "Fallo de impresión",
      });
    }
  }

  function resetForm() {
    setStatus({ step: "form" });
    setPrintState({ state: "idle" });
    setPlate("");
    setLookup({ state: "idle" });
    setVehicleTypeId("");
    setBoxId("");
    setNotes("");
  }

  if (status.step === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="text-sm text-emerald-400">Ingreso registrado</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          Ticket {status.ticketNumber}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Box {status.boxNumber} · {status.plate}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {printState.state !== "ok" ? (
            <button
              type="button"
              onClick={printEntryTicket}
              disabled={printState.state === "printing"}
              className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
            >
              {printState.state === "printing" ? "Imprimiendo..." : "Imprimir ticket"}
            </button>
          ) : (
            <p className="text-sm text-emerald-400">Ticket impreso</p>
          )}
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Registrar otro ingreso
          </button>
        </div>
        {printState.state === "fail" && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            No se pudo imprimir ({printState.message}). El ticket quedó en la cola de
            impresión para reintentar.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="plate" className="block text-xs font-medium text-neutral-400">
          Patente
        </label>
        <input
          id="plate"
          required
          value={plate}
          maxLength={10}
          onChange={(e) => setPlate(normalizePlate(e.target.value))}
          onBlur={(e) => lookupPlate(e.target.value)}
          placeholder="ABC123"
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-lg font-semibold tracking-widest uppercase text-neutral-100 outline-none focus:border-neutral-500"
        />
        {lookup.state === "found" ? (
          <p className="mt-1 text-xs text-emerald-400">
            Vehículo registrado — tipo: {lookup.vehicleTypeName}
          </p>
        ) : lookup.state === "new" ? (
          <p className="mt-1 text-xs text-amber-400">Vehículo nuevo — elegí el tipo</p>
        ) : null}
      </div>

      {lookup.state !== "found" ? (
        <div>
          <label htmlFor="vehicleType" className="block text-xs font-medium text-neutral-400">
            Tipo de vehículo
          </label>
          <select
            id="vehicleType"
            required
            value={vehicleTypeId}
            onChange={(e) => setVehicleTypeId(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          >
            <option value="">Seleccionar...</option>
            {vehicleTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="box-filter" className="block text-xs font-medium text-neutral-400">
            Box ({availableBoxes.length} disponibles)
          </label>
          {boxId ? (
            <span className="text-[11px] text-emerald-400">
              Box {availableBoxes.find((b) => b.id === boxId)?.number} elegido
            </span>
          ) : null}
        </div>
        <input
          id="box-filter"
          value={boxFilter}
          onChange={(e) => setBoxFilter(e.target.value)}
          placeholder="Escribí el número de box..."
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
        <div data-box-picker className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
          {[...boxesByFloor.entries()].map(([floorName, boxes]) => (
            <div key={floorName}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                {floorName}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {boxes.map((b) => {
                  const selected = b.id === boxId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      data-box-option
                      aria-pressed={selected}
                      onClick={() => setBoxId(b.id)}
                      className={
                        "min-w-10 rounded-md border px-2 py-1.5 text-sm font-medium tabular-nums transition-colors " +
                        (selected
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100")
                      }
                    >
                      {b.number}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredBoxes.length === 0 ? (
            <p className="text-xs text-neutral-500">Ningún box coincide con «{boxFilter}».</p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-xs font-medium text-neutral-400">
          Observaciones (opcional)
        </label>
        <input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status.step === "submitting" || availableBoxes.length === 0}
        className="w-full rounded-md bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
      >
        {status.step === "submitting" ? "Registrando..." : "Confirmar ingreso"}
      </button>

      {availableBoxes.length === 0 ? (
        <p className="text-center text-xs text-amber-400">
          No hay boxes disponibles. Liberá uno desde{" "}
          <Link href="/operaciones/estadias" className="underline">
            estadías activas
          </Link>
          .
        </p>
      ) : null}
    </form>
  );
}
