"use client";

import { useState } from "react";
import Link from "next/link";
import { normalizePlate } from "@/lib/plate";
import { SubmitButton } from "@/components/ui/submit-button";
import { BoxPicker } from "./box-picker";
import { IngresoSuccess, MovePrompt } from "./ingreso-success";
import { usePlateLookup } from "./use-plate-lookup";
import {
  useIngresoSubmit,
  type BoxOption,
  type VehicleTypeOption,
} from "./use-ingreso-submit";

interface Props {
  vehicleTypes: VehicleTypeOption[];
  availableBoxes: BoxOption[];
  /** false = no hay turno de caja abierto: no se puede registrar el ingreso. */
  shiftOpen: boolean;
}

export function IngresoForm({ vehicleTypes, availableBoxes, shiftOpen }: Props) {
  const {
    plate,
    setPlate,
    lookup,
    vehicleTypeId,
    setVehicleTypeId,
    lookupPlate,
    resetPlate,
  } = usePlateLookup();
  const [boxId, setBoxId] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [keyLeft, setKeyLeft] = useState(false);
  const [damage, setDamage] = useState("");
  const {
    error,
    status,
    setStatus,
    pendingMove,
    setPendingMove,
    shiftMissing,
    printState,
    setPrintState,
    onSubmit,
    confirmMove,
    printEntryTicket,
  } = useIngresoSubmit({
    plate,
    vehicleTypeId,
    lookup,
    vehicleTypes,
    availableBoxes,
    boxId,
    notes,
    keyLeft,
    damage,
    shiftOpen,
  });

  function resetForm() {
    setStatus({ step: "form" });
    setPrintState({ state: "idle" });
    setPendingMove(null);
    resetPlate();
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
      <IngresoSuccess
        ticketNumber={status.ticketNumber}
        plate={status.plate}
        boxNumber={status.boxNumber}
        moved={status.moved}
        printState={printState}
        onPrint={printEntryTicket}
        onReset={resetForm}
      />
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

      <BoxPicker
        availableBoxes={availableBoxes}
        boxId={boxId}
        boxFilter={boxFilter}
        onBoxFilterChange={setBoxFilter}
        onSelectBox={(id) => {
          setBoxId(id);
          setPendingMove(null);
        }}
      />

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
        <MovePrompt
          plate={pendingMove.plate}
          ticketNumber={pendingMove.ticketNumber}
          fromBoxNumber={pendingMove.fromBoxNumber}
          toBoxNumber={pendingMove.toBoxNumber}
          discardWarning={Boolean(keyLeft || damage.trim())}
          submitting={status.step === "submitting"}
          onConfirm={confirmMove}
          onCancel={() => setPendingMove(null)}
        />
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
          <SubmitButton
            type="submit"
            busy={status.step === "submitting"}
            disabled={availableBoxes.length === 0 || shiftMissing}
          >
            Confirmar ingreso
          </SubmitButton>
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
