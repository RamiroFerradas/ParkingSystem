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
  initialBoxId?: string | null;
}

export function BoxMapBoard({
  floors,
  floorOptions,
  canManage,
  initialBoxId = null,
}: BoxMapBoardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialBoxId);

  const selected = useMemo(
    () => floors.flatMap((floor) => floor.boxes).find((box) => box.id === selectedId) ?? null,
    [floors, selectedId],
  );

  const inactiveCount = useMemo(
    () => floors.flatMap((floor) => floor.boxes).filter((box) => !box.isActive).length,
    [floors],
  );

  return (
    <div className="space-y-6" data-box-editable={canManage ? "true" : undefined}>
      {canManage && (
        <p className="text-xs text-neutral-500">
          Tocá un box para editar número, sector, piso o estado.
          {inactiveCount > 0 &&
            ` Hay ${inactiveCount} ${inactiveCount === 1 ? "box dado de baja" : "boxes dados de baja"}.`}
        </p>
      )}

      {floors.map((floor) => {
        const visible = canManage ? floor.boxes : floor.boxes.filter((box) => box.isActive);
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
                  editable={canManage}
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
