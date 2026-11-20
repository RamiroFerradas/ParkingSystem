"use client";

import { useState, type FormEvent } from "react";
import { printSessionTicket } from "@/lib/print/client";
import type { PrintState } from "./ingreso-success";
import type { PlateLookup } from "./use-plate-lookup";

export interface VehicleTypeOption {
  id: string;
  name: string;
}

export interface BoxOption {
  id: string;
  number: string;
  floor_name: string;
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

export interface PendingMove {
  sessionId: string;
  ticketNumber: number;
  fromBoxNumber: string;
  toBoxNumber: string;
  plate: string;
}

export interface UseIngresoSubmitArgs {
  plate: string;
  vehicleTypeId: string;
  lookup: PlateLookup;
  vehicleTypes: VehicleTypeOption[];
  availableBoxes: BoxOption[];
  boxId: string;
  notes: string;
  keyLeft: boolean;
  damage: string;
  /** false = no hay turno de caja abierto: se muestra el aviso desde el inicio. */
  shiftOpen: boolean;
}

export interface UseIngresoSubmitResult {
  error: string | null;
  setError: (message: string | null) => void;
  status: Status;
  setStatus: (status: Status) => void;
  pendingMove: PendingMove | null;
  setPendingMove: (move: PendingMove | null) => void;
  shiftMissing: boolean;
  printState: PrintState;
  setPrintState: (state: PrintState) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  confirmMove: () => Promise<void>;
  printEntryTicket: () => Promise<void>;
}

/**
 * Submit, ticket print and box move for the ingreso form. The `/api/sessions/open`
 * response drives three outcomes: create the session, offer a move (the plate is
 * already parked elsewhere) or surface the error.
 */
export function useIngresoSubmit({
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
}: UseIngresoSubmitArgs): UseIngresoSubmitResult {
  const [shiftMissing, setShiftMissing] = useState(!shiftOpen);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ step: "form" });
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [printState, setPrintState] = useState<PrintState>({ state: "idle" });

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

  return {
    error,
    setError,
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
  };
}
