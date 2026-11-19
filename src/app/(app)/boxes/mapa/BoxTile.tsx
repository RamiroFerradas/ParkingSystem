"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";

interface BoxTileProps {
  id: string;
  number: string;
  sector: string | null;
  status: "available" | "occupied" | "out_of_service";
  plate: string | null;
  entryAt: string | null;
  vehicleTypeName: string | null;
  ticketNumber: string | null;
  elapsedLabel: string | null;
  canManage: boolean;
}

export type BoxTileStatus = "available" | "occupied" | "out_of_service";

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

export function BoxTile({
  id,
  number,
  sector,
  status,
  plate,
  entryAt,
  vehicleTypeName,
  ticketNumber,
  elapsedLabel,
  canManage,
}: BoxTileProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupied = status === "occupied";

  async function toggleService() {
    const next = status !== "out_of_service"; // available → disable; out_of_service → enable
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boxes/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxId: id, serviceEnabled: next }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Error al actualizar el box");
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setError("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-box-tile
      data-status={status}
      className={`flex flex-col justify-between rounded-lg border p-3 ${STATUS_STYLE[status]}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold tracking-tight">{number}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          {sector ?? "—"}
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
          <span className="opacity-80">{STATUS_LABEL[status]}</span>
        )}
      </div>

      {canManage && (
        <div className="mt-2">
          <button
            type="button"
            onClick={toggleService}
            disabled={busy || pending || occupied}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy || pending
              ? "…"
              : occupied
                ? "Ocupado (no modificable)"
                : status === "out_of_service"
                  ? "Habilitar"
                  : "Deshabilitar"}
          </button>
          {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
