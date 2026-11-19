"use client";

import { useMemo, useState } from "react";
import { BoxTile, type BoardBox } from "./BoxTile";
import { BoxEditPanel } from "./BoxEditPanel";

export interface BoardFloor {
  id: string;
  name: string;
  boxes: BoardBox[];
}

interface BoxMapBoardProps {
  floors: BoardFloor[];
  floorOptions: { id: string; name: string }[];
  canManage: boolean;
}

export function BoxMapBoard({ floors, floorOptions, canManage }: BoxMapBoardProps) {
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => floors.flatMap((floor) => floor.boxes).find((box) => box.id === selectedId) ?? null,
    [floors, selectedId],
  );

  function toggleEditMode() {
    setEditMode((current) => !current);
    setSelectedId(null);
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-neutral-200">Administrar en el mapa</p>
            <p className="text-xs text-neutral-500">
              {editMode
                ? "Tocá un box para editar número, sector, piso o estado."
                : "Activá el modo edición para modificar boxes sin salir del mapa."}
            </p>
          </div>
          <button
            type="button"
            data-box-edit-toggle
            data-edit-mode={editMode ? "on" : "off"}
            onClick={toggleEditMode}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
              editMode
                ? "border-sky-600 bg-sky-600 text-white hover:bg-sky-500"
                : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            {editMode ? "Salir de edición" : "Modo edición"}
          </button>
        </div>
      )}

      {floors.map((floor) => {
        const visible = editMode ? floor.boxes : floor.boxes.filter((box) => box.isActive);
        if (visible.length === 0) return null;

        return (
          <section key={floor.id} className="space-y-3">
            <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-wide text-neutral-300">
              {floor.name}
              <span className="text-xs font-normal text-neutral-600">
                {visible.length} boxes
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {visible.map((box) => (
                <BoxTile
                  key={box.id}
                  box={box}
                  editMode={editMode}
                  selected={box.id === selectedId}
                  onSelect={() => setSelectedId(box.id)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {selected && (
        <BoxEditPanel
          box={selected}
          floorOptions={floorOptions}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
