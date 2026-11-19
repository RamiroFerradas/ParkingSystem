"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardBox } from "./BoxTile";

interface FloorOption {
  id: string;
  name: string;
}

interface BoxEditPanelProps {
  box: BoardBox;
  floorOptions: FloorOption[];
  onClose: () => void;
}

const FIELD =
  "mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
const LABEL = "text-xs font-medium text-neutral-400";
const TOGGLE_ROW =
  "flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2";

export function BoxEditPanel({ box, floorOptions, onClose }: BoxEditPanelProps) {
  const router = useRouter();
  const [number, setNumber] = useState(box.number);
  const [sector, setSector] = useState(box.sector ?? "");
  const [floorId, setFloorId] = useState(box.floorId);
  const [serviceEnabled, setServiceEnabled] = useState(box.serviceEnabled);
  const [isActive, setIsActive] = useState(box.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupied = box.status === "occupied";
  const locked = occupied;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (serviceEnabled !== box.serviceEnabled) {
        const res = await fetch("/api/boxes/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxId: box.id, serviceEnabled }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? "No se pudo cambiar el servicio del box");
      }

      const patch: Record<string, unknown> = { id: box.id };
      const cleanNumber = number.trim().toUpperCase();
      if (cleanNumber !== box.number.toUpperCase()) patch.number = cleanNumber;
      if ((sector.trim() || null) !== (box.sector ?? null)) patch.sector = sector.trim();
      if (floorId !== box.floorId) patch.floorId = floorId;
      if (isActive !== box.isActive) patch.isActive = isActive;

      if (Object.keys(patch).length > 1) {
        const res = await fetch("/api/boxes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? "No se pudo guardar el box");
      }

      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-box-edit-panel>
      <button
        type="button"
        aria-label="Cerrar panel de edición"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-sm flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
        <header className="flex items-start justify-between border-b border-neutral-800 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Editar box</p>
            <h2 className="text-lg font-semibold tracking-tight">{box.number}</h2>
            <p className="text-xs text-neutral-500">
              {occupied
                ? `Ocupado por ${box.plate ?? "—"} · Ticket #${box.ticketNumber ?? "—"}`
                : box.isActive
                  ? "Libre para editar"
                  : "Dado de baja"}
            </p>
          </div>
          <button
            type="button"
            data-box-edit-close
            onClick={onClose}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Cerrar
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {occupied && (
            <p className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
              El box tiene una estadía abierta: finalizala para poder modificar número, sector,
              piso o estado.
            </p>
          )}

          <label className="block">
            <span className={LABEL}>Número</span>
            <input
              data-box-edit-number
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              maxLength={12}
              disabled={locked}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Sector</span>
            <input
              data-box-edit-sector
              value={sector}
              onChange={(event) => setSector(event.target.value)}
              placeholder="Sin sector"
              disabled={locked}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Piso</span>
            <select
              data-box-edit-floor
              value={floorId}
              onChange={(event) => setFloorId(event.target.value)}
              disabled={locked}
              className={FIELD}
            >
              {floorOptions.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
          </label>

          <div className={TOGGLE_ROW}>
            <div>
              <p className="text-sm text-neutral-200">Servicio habilitado</p>
              <p className="text-[11px] text-neutral-500">
                Deshabilitado = fuera de servicio, no se puede usar para ingresos.
              </p>
            </div>
            <input
              data-box-edit-service
              type="checkbox"
              checked={serviceEnabled}
              onChange={(event) => setServiceEnabled(event.target.checked)}
              disabled={locked}
              className="size-4 accent-emerald-500"
            />
          </div>

          <div className={TOGGLE_ROW}>
            <div>
              <p className="text-sm text-neutral-200">Box activo</p>
              <p className="text-[11px] text-neutral-500">
                Darlo de baja lo saca del mapa. El historial se conserva.
              </p>
            </div>
            <input
              data-box-edit-active
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={locked}
              className="size-4 accent-emerald-500"
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-box-edit-save
            onClick={save}
            disabled={busy || locked}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
