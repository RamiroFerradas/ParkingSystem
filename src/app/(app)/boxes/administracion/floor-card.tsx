"use client";

import { useState } from "react";
import { btnClsCompact, btnDangerCls, inputClsCompact } from "@/lib/ui-classes";
import type { AdminFloor } from "./FloorManager";
import { BoxChip } from "./box-chip";

export function FloorCard({
  floor,
  canMoveUp,
  canMoveDown,
  disabled,
  onAction,
}: {
  floor: AdminFloor;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  onAction: (url: string, method: "POST" | "PATCH", body: unknown) => Promise<boolean>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(floor.name);
  const [addingBox, setAddingBox] = useState(false);
  const [boxNumber, setBoxNumber] = useState("");
  const [boxSector, setBoxSector] = useState("");

  return (
    <section
      className={`rounded-xl border p-4 ${
        floor.is_active ? "border-neutral-800 bg-neutral-900" : "border-neutral-800/60 bg-neutral-900/50 opacity-70"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <>
            <input
              className={inputClsCompact + " w-full sm:w-52"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <button
              className={btnClsCompact}
              disabled={disabled || !newName.trim()}
              onClick={async () => {
                await onAction("/api/floors", "PATCH", { id: floor.id, name: newName.trim() });
                setRenaming(false);
              }}
            >
              Guardar
            </button>
            <button className={btnClsCompact} onClick={() => setRenaming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-neutral-100">{floor.name}</h2>
            <span className="text-xs text-neutral-600">{floor.boxes.length} boxes</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                className={btnClsCompact}
                disabled={disabled || !canMoveUp}
                onClick={() =>
                  onAction("/api/floors", "PATCH", {
                    id: floor.id,
                    sortOrder: floor.sort_order - 1,
                  })
                }
                title="Mover arriba"
              >
                ↑
              </button>
              <button
                className={btnClsCompact}
                disabled={disabled || !canMoveDown}
                onClick={() =>
                  onAction("/api/floors", "PATCH", {
                    id: floor.id,
                    sortOrder: floor.sort_order + 1,
                  })
                }
                title="Mover abajo"
              >
                ↓
              </button>
              <button className={btnClsCompact} disabled={disabled} onClick={() => setRenaming(true)}>
                Renombrar
              </button>
              <button
                className={btnClsCompact}
                disabled={disabled}
                onClick={() => setAddingBox((v) => !v)}
              >
                + Box
              </button>
              <button
                className={floor.is_active ? btnDangerCls : btnClsCompact}
                disabled={disabled}
                onClick={() =>
                  onAction("/api/floors", "PATCH", {
                    id: floor.id,
                    isActive: !floor.is_active,
                  })
                }
              >
                {floor.is_active ? "Desactivar piso" : "Reactivar piso"}
              </button>
            </div>
          </>
        )}
      </header>

      {addingBox && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const created = await onAction("/api/boxes", "POST", {
              floorId: floor.id,
              number: boxNumber,
              sector: boxSector,
            });
            // Un alta fallida conserva número y sector: el formulario sigue abierto.
            if (!created) return;
            setBoxNumber("");
            setBoxSector("");
            setAddingBox(false);
          }}
        >
          <input
            className={inputClsCompact + " w-full sm:w-36"}
            placeholder="Número (ej. PB-31)"
            value={boxNumber}
            onChange={(e) => setBoxNumber(e.target.value)}
            maxLength={12}
            required
            autoFocus
          />
          <input
            className={inputClsCompact + " w-full sm:w-36"}
            placeholder="Sector (opcional)"
            value={boxSector}
            onChange={(e) => setBoxSector(e.target.value)}
            maxLength={30}
          />
          <button type="submit" className={btnClsCompact} disabled={disabled || !boxNumber.trim()}>
            Agregar
          </button>
          <button type="button" className={btnClsCompact} onClick={() => setAddingBox(false)}>
            Cancelar
          </button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {floor.boxes.map((box) => (
          <BoxChip key={box.id} box={box} />
        ))}
      </div>
    </section>
  );
}
