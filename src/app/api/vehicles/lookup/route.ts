import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseQuery, vehicleLookupQuerySchema } from "@/lib/schemas/misc";

/** Búsqueda de vehículo por patente (alta rápida D1: reutilizar registro). */
export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { plate: normalized } = parseQuery(request, vehicleLookupQuerySchema, { plate: "" });
  if (!normalized) {
    return NextResponse.json({ found: false });
  }

  try {
    const rows = await query<{
      vehicle_type_id: string;
      vehicle_type_name: string;
      subscription_ends_on: string | null;
    }>(
      `SELECT v.vehicle_type_id, vt.name AS vehicle_type_name,
              (SELECT s.ends_on::text
                 FROM subscriptions s
                WHERE s.vehicle_id = v.id
                  AND s.branch_id = $2
                  AND s.status = 'active'
                  AND s.starts_on <= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                  AND s.ends_on >= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                LIMIT 1) AS subscription_ends_on
         FROM vehicles v
         JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
        WHERE v.plate = $1 AND NOT v.plate_is_placeholder
        LIMIT 1`,
      [normalized, user.branchId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ found: false });
    }
    return NextResponse.json({
      found: true,
      vehicleTypeId: rows[0]!.vehicle_type_id,
      vehicleTypeName: rows[0]!.vehicle_type_name,
      subscription: rows[0]!.subscription_ends_on
        ? { active: true, endsOn: rows[0]!.subscription_ends_on }
        : null,
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
