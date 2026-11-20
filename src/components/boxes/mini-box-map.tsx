import Link from "next/link";
import { query } from "@/lib/db/client";

interface BoxRow {
  id: string;
  number: string;
  floor_name: string;
  status: string;
  plate: string | null;
}

const TILE_TONES: Record<string, string> = {
  occupied:
    "border-red-500/60 bg-red-500/15 text-red-100 hover:border-red-400 hover:bg-red-500/25",
  available:
    "border-emerald-500/30 bg-emerald-500/5 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/10",
  out_of_service:
    "border-neutral-800 bg-neutral-900 text-neutral-600 hover:border-neutral-700",
};

const STATUS_LABEL: Record<string, string> = {
  occupied: "ocupado",
  available: "libre",
  out_of_service: "fuera de servicio",
};

/**
 * Vista previa del estacionamiento para el dashboard: cada box muestra su
 * número y, si está ocupado, la patente. Tocar un box abre el mapa grande con
 * ese box seleccionado.
 */
export async function MiniBoxMap({ branchId }: { branchId: string }) {
  const rows = await query<BoxRow>(
    `SELECT id, number, floor_name, status, plate
       FROM box_status
      WHERE branch_id = $1
      ORDER BY floor_sort, number`,
    [branchId],
  );
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-xs font-medium text-neutral-500">Mapa de boxes</p>
        <p className="mt-1 text-xs text-neutral-500">Sin boxes cargados todavía.</p>
      </div>
    );
  }

  const counts = { occupied: 0, available: 0, out_of_service: 0 };
  const floors = new Map<string, BoxRow[]>();
  for (const box of rows) {
    counts[box.status as keyof typeof counts] += 1;
    const list = floors.get(box.floor_name) ?? [];
    list.push(box);
    floors.set(box.floor_name, list);
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-200">Mapa de boxes</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Número y patente en vivo. Tocá un box para abrirlo en el mapa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-red-300">
            <span className="h-2 w-2 rounded-sm bg-red-500" aria-hidden />
            {counts.occupied} ocupados
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden />
            {counts.available} libres
          </span>
          <span className="inline-flex items-center gap-1.5 text-neutral-500">
            <span className="h-2 w-2 rounded-sm bg-neutral-700" aria-hidden />
            {counts.out_of_service} fuera
          </span>
        </div>
      </header>

      <div data-box-grid-mini className="mt-4 space-y-3">
        {[...floors.entries()].map(([floorName, boxes]) => (
          <div key={floorName}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              {floorName}
            </p>
            <div className="mt-1.5 grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(52px,1fr))]">
              {boxes.map((box) => {
                const status = STATUS_LABEL[box.status] ?? "fuera de servicio";
                const label = `Box ${box.number}, ${status}${
                  box.plate ? `, patente ${box.plate}` : ""
                }`;
                return (
                  <Link
                    key={box.id}
                    href={`/boxes/mapa?box=${box.id}`}
                    data-box-cell
                    aria-label={label}
                    title={label}
                    className={`flex min-h-11 flex-col items-center justify-center rounded-md border px-1 py-1 text-center transition-colors ${
                      TILE_TONES[box.status] ?? TILE_TONES.out_of_service
                    }`}
                  >
                    <span className="font-mono text-sm font-semibold leading-none tabular-nums">
                      {box.number}
                    </span>
                    {box.status === "occupied" ? (
                      <span className="mt-1 max-w-full truncate text-[9px] leading-none opacity-90">
                        {box.plate ?? "—"}
                      </span>
                    ) : box.status === "out_of_service" ? (
                      <span className="mt-1 text-[9px] leading-none">fuera</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/boxes/mapa"
        className="mt-4 flex min-h-10 items-center justify-between rounded-md border border-neutral-800 px-3 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
      >
        Ver mapa completo
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
