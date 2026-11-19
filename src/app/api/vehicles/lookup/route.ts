import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser } from "@/lib/api/guard";
import { normalizePlate } from "@/lib/plate";

/** Búsqueda de vehículo por patente (alta rápida D1: reutilizar registro). */
export async function GET(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const plate = new URL(request.url).searchParams.get("plate") ?? "";
  const normalized = normalizePlate(plate);
  if (!normalized) {
    return NextResponse.json({ found: false });
  }

  const rows = await query<{
    vehicle_type_id: string;
    vehicle_type_name: string;
  }>(
    `SELECT v.vehicle_type_id, vt.name AS vehicle_type_name
       FROM vehicles v
       JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
      WHERE v.plate = $1 AND NOT v.plate_is_placeholder
      LIMIT 1`,
    [normalized],
  );

  if (rows.length === 0) {
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({
    found: true,
    vehicleTypeId: rows[0]!.vehicle_type_id,
    vehicleTypeName: rows[0]!.vehicle_type_name,
  });
}
