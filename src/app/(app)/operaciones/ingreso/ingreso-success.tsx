"use client";

import { btnPrimaryCls } from "@/lib/ui-classes";

export type PrintState =
  | { state: "idle" }
  | { state: "printing" }
  | { state: "ok" }
  | { state: "fail"; message: string };

export interface IngresoSuccessProps {
  ticketNumber: number;
  plate: string;
  boxNumber: string;
  moved?: boolean;
  printState: PrintState;
  onPrint: () => void;
  onReset: () => void;
}

/** Post-ingreso panel: ticket number, optional reprint and the "another one" reset. */
export function IngresoSuccess({
  ticketNumber,
  plate,
  boxNumber,
  moved,
  printState,
  onPrint,
  onReset,
}: IngresoSuccessProps) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
      <p className="mt-1.5 text-xs uppercase tracking-wide text-emerald-400">
        {moved ? "Vehículo movido de box" : "Ingreso registrado"} · Ticket
      </p>
      <p className="mt-1 font-mono text-4xl font-semibold tabular-nums">
        {ticketNumber}
      </p>
      <p className="mt-1 font-mono text-xs text-neutral-400">
        Box {boxNumber} · {plate}
      </p>
      {moved ? (
        <p className="mt-2 text-xs text-neutral-500">
          Se conserva la misma estadía: no se recobró ni se emitió un ticket nuevo.
        </p>
      ) : null}
      <div className="mt-4 flex justify-center gap-2">
        {printState.state !== "ok" ? (
          <button
            type="button"
            onClick={onPrint}
            disabled={printState.state === "printing"}
            className={btnPrimaryCls}
          >
            {printState.state === "printing" ? "Imprimiendo..." : "Imprimir ticket"}
          </button>
        ) : (
          <p className="text-sm text-emerald-400">Ticket impreso</p>
        )}
        <button
          type="button"
          onClick={onReset}
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

export interface MovePromptProps {
  plate: string;
  ticketNumber: number;
  fromBoxNumber: string;
  toBoxNumber: string;
  /** Key or damage notes were typed: they belong to an entry, not to a move. */
  discardWarning: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Alternate outcome of the same submit: the plate is already parked in another
 * box, so the form offers to move it instead of opening a second session.
 */
export function MovePrompt({
  plate,
  ticketNumber,
  fromBoxNumber,
  toBoxNumber,
  discardWarning,
  submitting,
  onConfirm,
  onCancel,
}: MovePromptProps) {
  return (
    <div
      data-move-prompt
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3"
    >
      <p className="text-sm text-amber-200">
        La patente <span className="font-semibold">{plate}</span> ya está
        estacionada en el box{" "}
        <span className="font-semibold">{fromBoxNumber}</span> (ticket #
        {ticketNumber}).
      </p>
      <p className="mt-1 text-sm text-amber-200">
        ¿Moverla al box {toBoxNumber}?
      </p>
      {discardWarning ? (
        <p className="mt-1 text-xs text-amber-300">
          La llave y las roturas cargadas no se guardan al mover un vehículo:
          corresponden al ingreso.
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-move-confirm
          onClick={onConfirm}
          disabled={submitting}
          className="rounded-md bg-amber-200 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-amber-100 disabled:opacity-60"
        >
          {submitting ? "Moviendo..." : `Mover al box ${toBoxNumber}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
