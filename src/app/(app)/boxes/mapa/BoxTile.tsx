"use client";

import { useSyncExternalStore } from "react";
import { formatTime } from "@/lib/format";
import { cx } from "@/lib/ui-classes";

/** Suscripción vacía: solo interesa distinguir servidor de cliente. */
const subscribeNever = () => () => {};

export type BoxTileStatus = "available" | "occupied" | "out_of_service";

export interface BoardBox {
  id: string;
  number: string;
  sector: string | null;
  floorId: string;
  status: BoxTileStatus;
  plate: string | null;
  entryAt: string | null;
  vehicleTypeName: string | null;
  ticketNumber: string | null;
  elapsedLabel: string | null;
  serviceEnabled: boolean;
  isActive: boolean;
}

interface BoxTileProps {
  box: BoardBox;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
}

const STATUS_LABEL: Record<BoxTileStatus, string> = {
  available: "Libre",
  occupied: "Ocupado",
  out_of_service: "Fuera de servicio",
};

const STATUS_STYLE: Record<BoxTileStatus, string> = {
  available: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  occupied: "border-amber-800 bg-amber-950/60 text-amber-300",
  out_of_service: "border-red-900 bg-red-950/60 text-red-300",
};

const INACTIVE_STYLE =
  "border-dashed border-neutral-700 bg-neutral-900/40 text-neutral-500";

export function BoxTile({ box, editable, selected, onSelect }: BoxTileProps) {
  const { number, sector, status, plate, entryAt, vehicleTypeName, ticketNumber, elapsedLabel, isActive } = box;
  // El tiempo transcurrido depende del reloj: se pinta recién después de
  // hidratar para que el HTML del servidor y el primer render del cliente
  // coincidan (React #418 en /boxes/mapa).
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const occupied = status === "occupied";

  return (
    <div
      data-box-tile
      data-status={status}
      data-inactive={isActive ? undefined : "true"}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? onSelect : undefined}
      onKeyDown={
        editable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cx(
        "flex min-h-[96px] touch-manipulation flex-col justify-between rounded-lg border p-2.5 transition active:scale-[0.98] sm:min-h-[88px] sm:p-3",
        isActive ? STATUS_STYLE[status] : INACTIVE_STYLE,
        editable && "cursor-pointer hover:border-neutral-400",
        selected && "ring-2 ring-amber-400",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-base font-semibold tracking-tight sm:text-lg">
          {number}
        </span>
        <span className="truncate text-[10px] uppercase tracking-wider opacity-80">
          {isActive ? (sector ?? "—") : "Inactivo"}
        </span>
      </div>

      <div className="mt-1.5 min-w-0 text-[11px] leading-snug sm:mt-2 sm:text-xs">
        {occupied ? (
          <>
            <div className="truncate font-mono text-sm font-semibold tracking-[0.06em] text-neutral-100">
              {plate}
            </div>
            <div className="truncate opacity-80">{vehicleTypeName ?? "—"}</div>
            <div className="truncate tabular-nums opacity-80">
              {`Ticket #${ticketNumber ?? "—"}`}
            </div>
            <div className="truncate tabular-nums opacity-70">
              desde {formatTime(entryAt ?? "")}
              {mounted && elapsedLabel ? ` · ${elapsedLabel}` : ""}
            </div>
          </>
        ) : (
          <span className="opacity-80">
            {isActive ? STATUS_LABEL[status] : "Dado de baja"}
          </span>
        )}
      </div>
    </div>
  );
}
