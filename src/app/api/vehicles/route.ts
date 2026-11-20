import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

/** Listado de vehículos con búsqueda por patente (índice trgm) y última estadía. */
export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "vehicle.read_all"))) {
    return NextResponse.json(
      { error: "No tenés permiso para ver el listado de vehículos" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 200);

  try {
    const rows = await query(
      `SELECT v.id, v.plate, v.plate_is_placeholder, vt.name AS type_name, v.notes,
              (SELECT count(*)::int FROM parking_sessions s WHERE s.vehicle_id = v.id) AS sessions_count,
              (SELECT max(s.entry_at)::text FROM parking_sessions s WHERE s.vehicle_id = v.id) AS last_seen_at
         FROM vehicles v
         JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
        WHERE ($1::text = '' OR v.plate ILIKE '%' || $1::text || '%' OR v.notes ILIKE '%' || $1::text || '%')
        ORDER BY last_seen_at DESC NULLS LAST, v.plate
        LIMIT $2`,
      [q, limit],
    );
    return NextResponse.json({ vehicles: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
