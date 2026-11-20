"use client";

export interface BoxPickerBox {
  id: string;
  number: string;
  floor_name: string;
}

export interface BoxPickerProps {
  availableBoxes: BoxPickerBox[];
  boxId: string;
  boxFilter: string;
  onBoxFilterChange: (value: string) => void;
  onSelectBox: (id: string) => void;
}

/** Free boxes grouped by floor, filterable by number, rendered as pressed toggles. */
export function BoxPicker({
  availableBoxes,
  boxId,
  boxFilter,
  onBoxFilterChange,
  onSelectBox,
}: BoxPickerProps) {
  // Mapa de boxes: filtro por número + agrupado por piso.
  const filter = boxFilter.trim().toLowerCase();
  const filteredBoxes = filter
    ? availableBoxes.filter((b) => b.number.toLowerCase().includes(filter))
    : availableBoxes;
  const boxesByFloor = new Map<string, typeof availableBoxes>();
  for (const box of filteredBoxes) {
    const list = boxesByFloor.get(box.floor_name) ?? [];
    list.push(box);
    boxesByFloor.set(box.floor_name, list);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor="box-filter" className="block text-xs font-medium text-neutral-400">
          Box ({availableBoxes.length} disponibles)
        </label>
        {boxId ? (
          <span className="text-[11px] text-emerald-400">
            Box {availableBoxes.find((b) => b.id === boxId)?.number} elegido
          </span>
        ) : null}
      </div>
      <input
        id="box-filter"
        value={boxFilter}
        onChange={(e) => onBoxFilterChange(e.target.value)}
        placeholder="Escribí el número de box..."
        className="mt-1 w-full min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
      />
      <div data-box-picker className="mt-3 grid grid-cols-1 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {[...boxesByFloor.entries()].map(([floorName, boxes]) => (
          <div
            key={floorName}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              {floorName}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {boxes.map((b) => {
                const selected = b.id === boxId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    data-box-option
                    aria-pressed={selected}
                    onClick={() => onSelectBox(b.id)}
                    className={
                      "min-h-11 min-w-11 rounded-md border px-2 py-1.5 font-mono text-sm font-medium tabular-nums transition-colors " +
                      (selected
                        ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                        : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100")
                    }
                  >
                    {b.number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {/* El aviso de filtro solo aplica si había boxes y el filtro dejó la lista vacía. */}
        {availableBoxes.length > 0 && filteredBoxes.length === 0 ? (
          <p className="text-xs text-neutral-500">Ningún box coincide con «{boxFilter}».</p>
        ) : null}
      </div>
    </div>
  );
}
