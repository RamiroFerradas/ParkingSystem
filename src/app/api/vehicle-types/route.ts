import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createVehicleTypeSchema,
  updateVehicleTypeSchema,
  type CreateVehicleTypeBody,
  type UpdateVehicleTypeBody,
} from "@/lib/schemas/catalogs";

const PG_UNIQUE = "23505";

interface TypeRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

/** CRUD de tipos de vehículo. Solo roles con vehicle.manage. */

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "vehicle.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  try {
    const rows = await query<TypeRow>(
      `SELECT id, code, name, is_active, sort_order
         FROM vehicle_types ORDER BY sort_order, name`,
    );
    return NextResponse.json({ types: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "vehicle.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  const { data: body, error: bodyError } = await parseBody<CreateVehicleTypeBody>(
    request,
    createVehicleTypeSchema,
    "Nombre requerido (hasta 40 caracteres)",
  );
  if (bodyError) return bodyError;

  const { code, name, sortOrder } = body;

  // El código explícito no se recorta: si el caller lo manda, se valida tal cual.
  if (!code || code.length > 20) {
    return NextResponse.json(
      { error: "Código requerido (hasta 20 caracteres)" },
      { status: 400 },
    );
  }

  try {
    const rows = await query<TypeRow>(
      `INSERT INTO vehicle_types (code, name, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, code, name, is_active, sort_order`,
      [code, name, sortOrder],
    );
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'vehicle_type.create', 'vehicle_type', $2,
               jsonb_build_object('code', $3::text, 'name', $4::text))`,
      [user.userId, rows[0]!.id, code, name],
    );
    return NextResponse.json({ ok: true, type: rows[0] }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un tipo con ese código o nombre" },
          { status: 409 },
        );
      }
    }
    return rpcErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "vehicle.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  const { data: body, error: bodyError } = await parseBody<UpdateVehicleTypeBody>(
    request,
    updateVehicleTypeSchema,
    "Falta el tipo",
  );
  if (bodyError) return bodyError;

  const { id, name, sortOrder, isActive } = body;

  try {
    // Un tipo en uso no se desactiva: las estadías históricas lo referencian.
    if (isActive === false) {
      const used = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM vehicles WHERE vehicle_type_id = $1`,
        [id],
      );
      if ((used[0]?.n ?? 0) > 0) {
        return NextResponse.json(
          { error: "Hay vehículos con este tipo; no se puede desactivar" },
          { status: 400 },
        );
      }
    }

    const rows = await query<TypeRow>(
      `UPDATE vehicle_types SET
          name = COALESCE($2, name),
          sort_order = COALESCE($3, sort_order),
          is_active = COALESCE($4, is_active)
        WHERE id = $1
        RETURNING id, code, name, is_active, sort_order`,
      [
        id,
        name?.trim() ?? null,
        sortOrder === undefined ? null : Math.floor(sortOrder),
        isActive ?? null,
      ],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Tipo inexistente" }, { status: 404 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'vehicle_type.update', 'vehicle_type', $2, $3::jsonb)`,
      [user.userId, id, JSON.stringify({ name, sortOrder, isActive })],
    );
    return NextResponse.json({ ok: true, type: rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
