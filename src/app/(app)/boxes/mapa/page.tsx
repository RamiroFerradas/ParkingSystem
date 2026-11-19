import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { formatElapsed } from "@/lib/format";
import { BoxMapBoard, type BoardFloor } from "./BoxMapBoard";
import type { BoardBox, BoxTileStatus } from "./BoxTile";

interface BoxStatusRow {
  id: string;
  number: string;
  sector: string | null;
  status: string;
  floor_id: string;
  floor_name: string;
  floor_sort: number;
  plate: string | null;
  entry_at: string | null;
  vehicle_type_name: string | null;
  ticket_number: string | null;
  is_service_enabled: boolean;
}

interface InactiveBoxRow {
  id: string;
  number: string;
  sector: string | null;
  floor_id: string;
  floor_name: string;
  floor_sort: number;
  is_service_enabled: boolean;
}

async function loadBoxes(): Promise<BoxStatusRow[]> {
  return query<BoxStatusRow>(
    `SELECT b.id, b.number, b.sector, b.status, b.floor_id, b.floor_name, b.floor_sort,
            b.plate, b.entry_at, b.vehicle_type_name, s.ticket_number,
            b.is_service_enabled
       FROM box_status b
       LEFT JOIN parking_sessions s ON s.id = b.session_id
      ORDER BY b.floor_sort, b.number`,
  );
}

/** Los boxes dados de baja no están en la vista: se cargan aparte para poder
 * reactivarlos desde el modo edición del mapa. */
async function loadInactiveBoxes(): Promise<InactiveBoxRow[]> {
  return query<InactiveBoxRow>(
    `SELECT b.id, b.number, b.sector, b.floor_id,
            f.name AS floor_name, f.sort_order AS floor_sort,
            b.is_service_enabled
       FROM parking_boxes b
       JOIN parking_floors f ON f.id = b.floor_id AND f.is_active
      WHERE NOT b.is_active
      ORDER BY f.sort_order, b.number`,
  );
}

async function loadFloorOptions(): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT id, name FROM parking_floors WHERE is_active ORDER BY sort_order`,
  );
}

function elapsedFor(entryAt: string | null): string | null {
  if (!entryAt) return null;
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(entryAt).getTime()) / 60000),
  );
  return formatElapsed(minutes);
}

export default async function MapaBoxesPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialBoxId = typeof params.box === "string" ? params.box : null;
  const user = await getSessionUser();
  const canManage = user ? await hasPermission(user.role, "box.manage") : false;
  const [boxes, inactiveBoxes, floorOptions] = await Promise.all([
    loadBoxes(),
    loadInactiveBoxes(),
    loadFloorOptions(),
  ]);

  // Los pisos se crean en el orden configurado y así se renderizan.
  const floors = new Map<string, BoardFloor>();
  for (const floor of floorOptions) {
    floors.set(floor.id, { id: floor.id, name: floor.name, boxes: [] });
  }

  const counts: Record<BoxTileStatus, number> = {
    available: 0,
    occupied: 0,
    out_of_service: 0,
  };

  function floorFor(id: string, name: string): BoardFloor {
    let floor = floors.get(id);
    if (!floor) {
      floor = { id, name, boxes: [] };
      floors.set(id, floor);
    }
    return floor;
  }

  for (const b of boxes) {
    const status = b.status as BoxTileStatus;
    counts[status] = (counts[status] ?? 0) + 1;
    const box: BoardBox = {
      id: b.id,
      number: b.number,
      sector: b.sector,
      floorId: b.floor_id,
      status,
      plate: b.plate,
      entryAt: b.entry_at,
      vehicleTypeName: b.vehicle_type_name,
      ticketNumber: b.ticket_number,
      elapsedLabel: elapsedFor(b.entry_at),
      serviceEnabled: b.is_service_enabled,
      isActive: true,
    };
    floorFor(b.floor_id, b.floor_name).boxes.push(box);
  }

  for (const b of inactiveBoxes) {
    const box: BoardBox = {
      id: b.id,
      number: b.number,
      sector: b.sector,
      floorId: b.floor_id,
      status: b.is_service_enabled ? "available" : "out_of_service",
      plate: null,
      entryAt: null,
      vehicleTypeName: null,
      ticketNumber: null,
      elapsedLabel: null,
      serviceEnabled: b.is_service_enabled,
      isActive: false,
    };
    floorFor(b.floor_id, b.floor_name).boxes.push(box);
  }

  const sortedFloors = [...floors.values()].filter((floor) => floor.boxes.length > 0);

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

      {sortedFloors.length === 0 ? (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
          No hay boxes configurados.
        </p>
      ) : (
        <BoxMapBoard
          floors={sortedFloors}
          floorOptions={floorOptions}
          canManage={canManage}
          initialBoxId={initialBoxId}
        />
      )}
    </div>
  );
}
