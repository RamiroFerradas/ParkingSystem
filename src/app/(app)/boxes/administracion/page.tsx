import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { FloorManager, type AdminFloor } from "./FloorManager";

interface JoinRow {
  floor_id: string;
  floor_name: string;
  sort_order: number;
  floor_active: boolean;
  box_id: string | null;
  number: string | null;
  sector: string | null;
  box_active: boolean | null;
  is_service_enabled: boolean | null;
  status: string | null;
  plate: string | null;
}

async function loadFloors(): Promise<AdminFloor[]> {
  const rows = await query<JoinRow>(
    `SELECT f.id AS floor_id, f.name AS floor_name, f.sort_order, f.is_active AS floor_active,
            b.id AS box_id, b.number, b.sector, b.is_active AS box_active,
            b.is_service_enabled, bs.status, bs.plate
       FROM parking_floors f
       LEFT JOIN parking_boxes b  ON b.floor_id = f.id
       LEFT JOIN box_status bs    ON bs.id = b.id
      ORDER BY f.sort_order, b.number`,
  );

  const floors = new Map<string, AdminFloor>();
  for (const r of rows) {
    let floor = floors.get(r.floor_id);
    if (!floor) {
      floor = {
        id: r.floor_id,
        name: r.floor_name,
        sort_order: r.sort_order,
        is_active: r.floor_active,
        boxes: [],
      };
      floors.set(r.floor_id, floor);
    }
    if (r.box_id) {
      floor.boxes.push({
        id: r.box_id,
        number: r.number!,
        sector: r.sector,
        is_active: r.box_active ?? true,
        is_service_enabled: r.is_service_enabled ?? true,
        status: r.box_active ? r.status : null,
        plate: r.plate,
      });
    }
  }
  return [...floors.values()];
}

export default async function AdministracionBoxesPage() {
  const user = await getSessionUser();
  const canManage = user ? await hasPermission(user.role, "box.manage") : false;

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Estructura de boxes</h1>
        <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
          Solo el administrador puede modificar la estructura de pisos y boxes.
        </p>
      </div>
    );
  }

  const floors = await loadFloors();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Estructura de boxes</h1>
        <p className="text-sm text-neutral-500">
          Creá pisos, generá sus boxes en lote o agregá lugares cuando el estacionamiento se
          expanda. Para editar un box (número, sector, piso o estado), tocá su chip y se abre en
          el mapa. Los cambios quedan registrados en la auditoría.
        </p>
      </header>

      <FloorManager floors={floors} />
    </div>
  );
}
