import { query } from "@/lib/db/client";

const BOX_TONES: Record<string, string> = {
  occupied: "bg-red-500/80",
  available: "bg-emerald-500/60",
  out_of_service: "bg-neutral-700",
};

/**
 * Mini mapa de boxes para el dashboard: cuadritos de 10px por piso, con el
 * resumen del estado al lado. Mismo dato que el mapa grande, mucho más chico.
 */
export async function MiniBoxMap({ branchId }: { branchId: string }) {
  const rows = await query<{
    number: string;
    floor_name: string;
    status: string;
    plate: string | null;
  }>(
    `SELECT number, floor_name, status, plate
       FROM box_status
      WHERE branch_id = $1
      ORDER BY floor_sort, number`,
    [branchId],
  );
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-xs font-medium text-neutral-500">Mapa de boxes</p>
        <p className="mt-1 text-xs text-neutral-500">
          Sin boxes cargados todavía.
        </p>
      </div>
    );
  }

  const counts = { occupied: 0, available: 0, out_of_service: 0 };
  const floors = new Map<string, typeof rows>();
  for (const box of rows) {
    counts[box.status as keyof typeof counts] += 1;
    const list = floors.get(box.floor_name) ?? [];
    list.push(box);
    floors.set(box.floor_name, list);
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-neutral-500">Mapa de boxes</p>
        <p className="flex gap-3 text-[11px] tabular-nums">
          <span className="text-red-400">{counts.occupied} ocup.</span>
          <span className="text-emerald-400">{counts.available} libres</span>
          <span className="text-neutral-500">{counts.out_of_service} fuera</span>
        </p>
      </div>
      <div data-box-grid-mini className="mt-2 space-y-1.5">
        {[...floors.entries()].map(([floorName, boxes]) => (
          <div key={floorName} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-[10px] uppercase tracking-wide text-neutral-600">
              {floorName}
            </span>
            <div className="flex flex-wrap gap-[3px]">
              {boxes.map((box) => (
                <span
                  key={box.number}
                  data-box-cell
                  title={`Box ${box.number} · ${
                    box.status === "occupied"
                      ? `ocupado${box.plate ? ` (${box.plate})` : ""}`
                      : box.status === "available"
                        ? "libre"
                        : "fuera de servicio"
                  }`}
                  className={`inline-block h-2.5 w-2.5 rounded-[2px] ${BOX_TONES[box.status] ?? BOX_TONES.out_of_service}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
