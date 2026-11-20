"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { printSessionTicket } from "@/lib/print/client";
import { normalizePlate } from "@/lib/plate";

interface Props {
  vehicleTypes: { id: string; name: string }[];
  availableBoxes: { id: string; number: string; floor_name: string }[];
  /** false = no hay turno de caja abierto: no se puede registrar el ingreso. */
  shiftOpen: boolean;
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
      moved?: boolean;
    };

interface PendingMove {
  sessionId: string;
  ticketNumber: number;
  fromBoxNumber: string;
  toBoxNumber: string;
  plate: string;
}

export function IngresoForm({ vehicleTypes, availableBoxes, shiftOpen }: Props) {
  const [plate, setPlate] = useState("");
  const [shiftMissing, setShiftMissing] = useState(!shiftOpen);
  const [lookup, setLookup] = useState<
    | { state: "idle" }
    | {
        state: "found";
        vehicleTypeName: string;
        vehicleTypeId: string;
        subscription?: { endsOn: string } | null;
      }
    | { state: "new" }
  >({ state: "idle" });
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [boxId, setBoxId] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [keyLeft, setKeyLeft] = useState(false);
  const [damage, setDamage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ step: "form" });
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
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
        subscription?: { active: boolean; endsOn: string } | null;
      };
      if (data.found && data.vehicleTypeId && data.vehicleTypeName) {
        setLookup({
          state: "found",
          vehicleTypeName: data.vehicleTypeName,
          vehicleTypeId: data.vehicleTypeId,
          subscription: data.subscription ?? null,
        });
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
    setPendingMove(null);
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
          keyLeft,
          damageNotes: damage,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        sameBox?: boolean;
        ticketNumber?: number;
        sessionId?: string;
        session?: { id: string; ticketNumber: number; boxNumber: string };
      };
      if (!res.ok) {
        // Ya está estacionada en OTRO box: no se crea nada, se ofrece moverla.
        if (data.code === "VEHICLE_PARKED" && data.session && !data.sameBox) {
          setPendingMove({
            sessionId: data.session.id,
            ticketNumber: data.session.ticketNumber,
            fromBoxNumber: data.session.boxNumber,
            toBoxNumber: availableBoxes.find((b) => b.id === boxId)?.number ?? "",
            plate,
          });
          setStatus({ step: "form" });
          return;
        }
        if (data.code === "NO_OPEN_SHIFT") {
          setShiftMissing(true);
          setStatus({ step: "form" });
          return;
        }
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

  /** Mueve la estadía existente al box elegido; no emite ticket nuevo ni recobra. */
  async function confirmMove() {
    if (!pendingMove) return;
    setError(null);
    setStatus({ step: "submitting" });
    try {
      const res = await fetch("/api/sessions/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: pendingMove.sessionId, boxId }),
      });
      const data = (await res.json()) as {
        error?: string;
        ticketNumber?: number;
        boxNumber?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo mover el vehículo");
        setStatus({ step: "form" });
        return;
      }
      setStatus({
        step: "done",
        moved: true,
        ticketNumber: data.ticketNumber ?? pendingMove.ticketNumber,
        sessionId: pendingMove.sessionId,
        plate: pendingMove.plate,
        vehicleTypeName:
          lookup.state === "found"
            ? lookup.vehicleTypeName
            : vehicleTypes.find((t) => t.id === vehicleTypeId)?.name ?? "",
        boxNumber: data.boxNumber ?? pendingMove.toBoxNumber,
      });
      setPendingMove(null);
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
    setPendingMove(null);
    setPlate("");
    setLookup({ state: "idle" });
    setVehicleTypeId("");
    setBoxId("");
    setNotes("");
    setKeyLeft(false);
    setDamage("");
  }

  const selectedBox = availableBoxes.find((b) => b.id === boxId);
  const selectedTypeName =
    lookup.state === "found"
      ? lookup.vehicleTypeName
      : vehicleTypes.find((t) => t.id === vehicleTypeId)?.name;

  if (status.step === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="mt-1.5 text-xs uppercase tracking-wide text-emerald-400">
          {status.moved ? "Vehículo movido de box" : "Ingreso registrado"} · Ticket
        </p>
        <p className="mt-1 font-mono text-4xl font-semibold tabular-nums">
          {status.ticketNumber}
        </p>
        <p className="mt-1 font-mono text-xs text-neutral-400">
          Box {status.boxNumber} · {status.plate}
        </p>
        {status.moved ? (
          <p className="mt-2 text-xs text-neutral-500">
            Se conserva la misma estadía: no se recobró ni se emitió un ticket nuevo.
          </p>
        ) : null}
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
      {shiftMissing && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3">
          <p className="text-sm font-medium text-amber-300">
            No hay turno de caja abierto
          </p>
          <p className="mt-1 text-xs text-amber-200">
            Para registrar un ingreso primero hay que abrir el turno.{" "}
            <Link href="/administracion/turnos" className="underline">
              Abrir turno de caja
            </Link>
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <div>
          <label htmlFor="plate" className="block text-xs font-medium text-neutral-400">
            Patente
          </label>
          {/* La patente se escribe sobre una chapa: mismo formato que el operador lee */}
          <div className="mt-1.5 w-full max-w-full overflow-hidden sm:max-w-64 rounded-md bg-plate shadow-[0_1px_0_rgba(0,0,0,0.55)]">
            <div className="h-1.5 bg-plate-blue" />
            <input
              id="plate"
              required
              value={plate}
              maxLength={10}
              autoComplete="off"
              onChange={(e) => {
                setPlate(normalizePlate(e.target.value));
                setPendingMove(null);
              }}
              onBlur={(e) => lookupPlate(e.target.value)}
              placeholder="ABC123"
              className="w-full bg-transparent px-3 py-2 text-center font-mono text-2xl font-semibold uppercase tracking-[0.2em] text-plate-ink outline-none placeholder:text-plate-ink/30"
            />
          </div>
          {lookup.state === "found" ? (
            lookup.subscription ? (
              <p className="mt-1 text-xs text-emerald-400">
                Abonado hasta {lookup.subscription.endsOn.split("-").reverse().join("/")}
              </p>
            ) : (
              <p className="mt-1 text-xs text-emerald-400">Vehículo registrado</p>
            )
          ) : lookup.state === "new" ? (
            <p className="mt-1 text-xs text-amber-400">Vehículo nuevo — elegí el tipo</p>
          ) : null}
        </div>

        {lookup.state === "found" ? (
          <div>
            <span className="block text-xs font-medium text-neutral-400">
              Tipo de vehículo
            </span>
            <div className="mt-1 flex min-h-[42px] items-center rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-200">
              {lookup.vehicleTypeName}
              <span className="ml-2 text-[11px] text-neutral-500">registrado</span>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="vehicleType" className="block text-xs font-medium text-neutral-400">
              Tipo de vehículo
            </label>
            <select
              id="vehicleType"
              required
              value={vehicleTypeId}
              onChange={(e) => setVehicleTypeId(e.target.value)}
              className="mt-1 w-full min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            >
              <option value="">Seleccionar...</option>
              {vehicleTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

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
          className="mt-1 w-full min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
        <div data-box-picker className="mt-3 grid grid-cols-1 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {[...boxesByFloor.entries()].map(([floorName, boxes]) => (
            <div
              key={floorName}
              className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                {floorName}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {boxes.map((b) => {
                  const selected = b.id === boxId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      data-box-option
                      aria-pressed={selected}
                      onClick={() => {
                        setBoxId(b.id);
                        setPendingMove(null);
                      }}
                      className={
                        "min-h-11 min-w-11 rounded-md border px-2 py-1.5 font-mono text-sm font-medium tabular-nums transition-colors " +
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
          {/* El aviso de filtro solo aplica si había boxes y el filtro dejó la lista vacía. */}
          {availableBoxes.length > 0 && filteredBoxes.length === 0 ? (
            <p className="text-xs text-neutral-500">Ningún box coincide con «{boxFilter}».</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <div>
          <label htmlFor="notes" className="block text-xs font-medium text-neutral-400">
            Observaciones (opcional)
          </label>
          <input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </div>

        <label className="flex items-start gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2.5">
          <input
            type="checkbox"
            checked={keyLeft}
            onChange={(e) => setKeyLeft(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-neutral-100"
          />
          <span>
            <span className="block text-sm text-neutral-200">Deja la llave puesta</span>
            <span className="block text-xs text-neutral-500">
              La llave queda en el vehículo; se verifica al egresar.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label htmlFor="damage" className="block text-xs font-medium text-neutral-400">
          Roturas o daños existentes (opcional)
        </label>
        <textarea
          id="damage"
          rows={3}
          maxLength={500}
          value={damage}
          onChange={(e) => setDamage(e.target.value)}
          placeholder="Ej: rayón en puerta trasera derecha, paragolpes hundido..."
          className="mt-1 w-full resize-y min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
        <p className="mt-1 text-[11px] text-neutral-600">{damage.length}/500</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {pendingMove ? (
        <div
          data-move-prompt
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3"
        >
          <p className="text-sm text-amber-200">
            La patente <span className="font-semibold">{pendingMove.plate}</span> ya está
            estacionada en el box{" "}
            <span className="font-semibold">{pendingMove.fromBoxNumber}</span> (ticket #
            {pendingMove.ticketNumber}).
          </p>
          <p className="mt-1 text-sm text-amber-200">
            ¿Moverla al box {pendingMove.toBoxNumber}?
          </p>
          {keyLeft || damage.trim() ? (
            <p className="mt-1 text-xs text-amber-300">
              La llave y las roturas cargadas no se guardan al mover un vehículo:
              corresponden al ingreso.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-move-confirm
              onClick={confirmMove}
              disabled={status.step === "submitting"}
              className="rounded-md bg-amber-200 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {status.step === "submitting"
                ? "Moviendo..."
                : `Mover al box ${pendingMove.toBoxNumber}`}
            </button>
            <button
              type="button"
              onClick={() => setPendingMove(null)}
              disabled={status.step === "submitting"}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-neutral-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-400">
            {selectedBox ? (
              <>
                Box{" "}
                <span className="font-mono font-medium text-neutral-100">
                  {selectedBox.number}
                </span>
                {selectedTypeName ? ` · ${selectedTypeName}` : ""}
                {plate ? ` · ${plate}` : ""}
              </>
            ) : (
              "Elegí un box para continuar"
            )}
          </p>
          <button
            type="submit"
            disabled={status.step === "submitting" || availableBoxes.length === 0 || shiftMissing}
            className="w-full rounded-md bg-neutral-100 px-6 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-60 sm:w-auto"
          >
            {status.step === "submitting" ? "Registrando..." : "Confirmar ingreso"}
          </button>
        </div>
      )}

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
