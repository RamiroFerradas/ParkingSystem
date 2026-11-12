import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { BoxTile, type BoxTileStatus } from "./BoxTile";

interface BoxStatusRow {
  id: string;
  number: string;
  sector: string | null;
  status: string;
  floor_id: string;
  floor_name: string;
  plate: string | null;
  entry_at: string | null;
}

async function loadBoxes(): Promise<BoxStatusRow[]> {
  return query<BoxStatusRow>(
    `SELECT id, number, sector, status, floor_id, floor_name, plate, entry_at
       FROM box_status
      ORDER BY floor_sort, number`,
  );
}

export default async function MapaBoxesPage() {
  const user = await getSessionUser();
  const canManage = user ? await hasPermission(user.role, "box.manage") : false;
  const boxes = await loadBoxes();

  const floors = new Map<string, { name: string; boxes: BoxStatusRow[] }>();
  const counts: Record<BoxTileStatus, number> = {
    available: 0,
    occupied: 0,
    out_of_service: 0,
  };

  for (const b of boxes) {
    const key = b.status as BoxTileStatus;
    counts[key] = (counts[key] ?? 0) + 1;
    let floor = floors.get(b.floor_id);
    if (!floor) {
      floor = { name: b.floor_name, boxes: [] };
      floors.set(b.floor_id, floor);
    }
    floor.boxes.push(b);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Mapa de boxes</h1>
        <p className="text-sm text-neutral-500">
          Estado en tiempo real de los boxes, organizados por piso
        </p>
      </header>

      <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />
          Libres: {counts.available}
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-amber-500" />
          Ocupados: {counts.occupied}
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-red-500" />
          Fuera de servicio: {counts.out_of_service}
        </span>
      </div>

      {floors.size === 0 ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
          No hay boxes configurados.
        </p>
      ) : (
        <div className="space-y-8">
          {[...floors.values()].map((floor) => (
            <section key={floor.name} className="space-y-3">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-wide text-neutral-300">
                {floor.name}
                <span className="text-xs font-normal text-neutral-600">
                  {floor.boxes.length} boxes
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {floor.boxes.map((b) => (
                  <BoxTile
                    key={b.id}
                    id={b.id}
                    number={b.number}
                    sector={b.sector}
                    status={b.status as BoxTileStatus}
                    plate={b.plate}
                    entryAt={b.entry_at}
                    canManage={canManage}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
