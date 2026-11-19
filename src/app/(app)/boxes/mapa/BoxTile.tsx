"use client";

import { formatTime } from "@/lib/format";

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
  editMode: boolean;
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

export function BoxTile({ box, editMode, selected, onSelect }: BoxTileProps) {
  const { number, sector, status, plate, entryAt, vehicleTypeName, ticketNumber, elapsedLabel, isActive } = box;
  const occupied = status === "occupied";

  return (
    <div
      data-box-tile
      data-status={status}
      data-inactive={isActive ? undefined : "true"}
      role={editMode ? "button" : undefined}
      tabIndex={editMode ? 0 : undefined}
      onClick={editMode ? onSelect : undefined}
      onKeyDown={
        editMode
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={`flex flex-col justify-between rounded-lg border p-3 ${
        isActive ? STATUS_STYLE[status] : INACTIVE_STYLE
      } ${editMode ? "cursor-pointer transition hover:border-neutral-400" : ""} ${
        selected ? "ring-2 ring-sky-500/70" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold tracking-tight">{number}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          {isActive ? (sector ?? "—") : "Inactivo"}
        </span>
      </div>

      <div className="mt-2 min-h-10 text-xs">
        {occupied ? (
          <>
            <div className="font-semibold tracking-wide text-neutral-100">{plate}</div>
            <div className="opacity-80">{vehicleTypeName ?? "—"}</div>
            <div className="tabular-nums opacity-80">{`Ticket #${ticketNumber ?? "—"}`}</div>
            <div className="tabular-nums opacity-70">
              desde {formatTime(entryAt ?? "")}
              {elapsedLabel ? ` · ${elapsedLabel}` : ""}
            </div>
          </>
        ) : (
          <span className="opacity-80">
            {isActive ? STATUS_LABEL[status] : "Dado de baja"}
          </span>
        )}
      </div>

      {editMode && (
        <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
          Editar
        </span>
      )}
    </div>
  );
}
