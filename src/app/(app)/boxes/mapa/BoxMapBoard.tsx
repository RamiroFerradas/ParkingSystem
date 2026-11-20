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

/**
 * Mapa operable desde el teléfono: buscador de patente/ticket arriba, filtro de
 * piso en chips deslizables y una grilla que en 360px mantiene dos boxes por
 * fila con la patente legible. El buscador es lo que convierte "¿dónde está el
 * auto del ticket 41?" en un toque en vez de recorrer ocho pisos con el dedo.
 */
export function BoxMapBoard({
  floors,
  floorOptions,
  canManage,
  initialBoxId = null,
}: BoxMapBoardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialBoxId);
  const [search, setSearch] = useState("");
  const [floorId, setFloorId] = useState<string>("all");

  const selected = useMemo(
    () => floors.flatMap((floor) => floor.boxes).find((box) => box.id === selectedId) ?? null,
    [floors, selectedId],
  );

  const inactiveCount = useMemo(
    () => floors.flatMap((floor) => floor.boxes).filter((box) => !box.isActive).length,
    [floors],
  );

  const term = search.trim().toLowerCase().replace(/\s+/g, "");

  const visibleFloors = useMemo(() => {
    return floors
      .filter((floor) => floorId === "all" || floor.id === floorId)
      .map((floor) => {
        const boxes = (canManage ? floor.boxes : floor.boxes.filter((box) => box.isActive))
          .filter((box) => {
            if (!term) return true;
            return (
              box.number.toLowerCase().replace(/\s+/g, "").includes(term) ||
              (box.plate ?? "").toLowerCase().replace(/\s+/g, "").includes(term) ||
              (box.ticketNumber ?? "").toLowerCase().includes(term)
            );
          })
          .sort((a, b) => a.number.localeCompare(b.number, "es", { numeric: true }));
        return { ...floor, boxes };
      })
      .filter((floor) => floor.boxes.length > 0);
  }, [floors, floorId, canManage, term]);

  const visibleCount = visibleFloors.reduce((total, floor) => total + floor.boxes.length, 0);

  return (
    <div className="space-y-4" data-box-editable={canManage ? "true" : undefined}>
      <div className="sticky top-0 z-20 -mx-3 space-y-2 border-b border-neutral-800/60 bg-neutral-950/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar patente, ticket o box"
            aria-label="Buscar patente, ticket o box"
            className="min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 pl-9 pr-9 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-sky-600 lg:min-h-10"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-100"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
          <button
            type="button"
            onClick={() => setFloorId("all")}
            aria-pressed={floorId === "all"}
            className={
              "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium " +
              (floorId === "all"
                ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                : "border-neutral-700 text-neutral-300")
            }
          >
            Todos
          </button>
          {floorOptions.map((floor) => (
            <button
              key={floor.id}
              type="button"
              onClick={() => setFloorId(floor.id)}
              aria-pressed={floorId === floor.id}
              className={
                "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium " +
                (floorId === floor.id
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                  : "border-neutral-700 text-neutral-300")
              }
            >
              {floor.name}
            </button>
          ))}
        </div>

        {term ? (
          <p className="text-[11px] text-neutral-500" role="status">
            {visibleCount === 0
              ? "Sin coincidencias."
              : `${visibleCount} ${visibleCount === 1 ? "box encontrado" : "boxes encontrados"}.`}
          </p>
        ) : null}
      </div>

      {canManage && (
        <p className="text-xs text-neutral-500">
          Tocá un box para editar número, sector, piso o estado.
          {inactiveCount > 0 &&
            ` Hay ${inactiveCount} ${inactiveCount === 1 ? "box dado de baja" : "boxes dados de baja"}.`}
        </p>
      )}

      {visibleFloors.length === 0 ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center text-sm text-neutral-500">
          {term || floorId !== "all"
            ? "Ningún box coincide con el filtro."
            : "No hay boxes para mostrar."}
        </p>
      ) : null}

      {visibleFloors.map((floor) => (
        <section key={floor.id} className="space-y-2">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-wide text-neutral-300">
            {floor.name}
            <span className="text-xs font-normal text-neutral-600">
              {floor.boxes.length} boxes
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-2 min-[420px]:gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {floor.boxes.map((box) => (
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
      ))}

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
