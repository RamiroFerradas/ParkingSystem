import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { parseBody } from "@/lib/api/body";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";
import {
  createBoxSchema,
  updateBoxSchema,
  type CreateBoxBody,
  type UpdateBoxBody,
} from "@/lib/schemas/catalogs";

const PG_UNIQUE = "23505";

interface BoxRow {
  id: string;
  number: string;
  sector: string | null;
  floor_id: string;
  is_active: boolean;
}

async function requireAdmin() {
  const { context, error } = await getBranchContextOrFail("box.manage");
  if (error) {
    return {
      context: null,
      response: NextResponse.json(error.body, { status: error.status }),
    };
  }
  return { context, response: null };
}

/** Dar de alta un box individual en un piso. */
export async function POST(request: Request) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const { data: body, error: bodyError } = await parseBody<CreateBoxBody>(
    request,
    createBoxSchema,
    "Necesito el piso y un número de box (hasta 12 caracteres)",
  );
  if (bodyError) return bodyError;

  const { floorId, number: cleanNumber, sector } = body;

  try {
    // El piso debe pertenecer a la sucursal activa: es lo que evita crear un
    // box de otra sucursal escondido detrás de un floor_id ajeno.
    const floor = await query<{ id: string }>(
      "SELECT id FROM parking_floors WHERE id = $1 AND branch_id = $2",
      [floorId, context!.branchId],
    );
    if (!floor[0]) {
      return NextResponse.json({ error: "El piso indicado no existe" }, { status: 400 });
    }

    const rows = await query<BoxRow>(
      `INSERT INTO parking_boxes (number, sector, floor_id, branch_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, number, sector, floor_id, is_active`,
      [cleanNumber, sector, floorId, context!.branchId],
    );

    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'box.create', 'parking_box', $3,
               jsonb_build_object('number', $4::text, 'floor_id', $5::text))`,
      [context!.user.userId, context!.branchId, rows[0]!.id, cleanNumber, floorId],
    );

    return NextResponse.json({ ok: true, box: rows[0] }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un box con ese número" },
          { status: 409 },
        );
      }
      if ((err as { code?: string }).code === "23503") {
        return NextResponse.json({ error: "El piso indicado no existe" }, { status: 400 });
      }
    }
    return rpcErrorResponse(err);
  }
}

/** Editar box: número, sector, piso o alta/baja. No se da de baja un box ocupado. */
export async function PATCH(request: Request) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const { data: body, error: bodyError } = await parseBody<UpdateBoxBody>(
    request,
    updateBoxSchema,
    "Falta el box",
  );
  if (bodyError) return bodyError;

  const { id, number, sector, floorId, isActive } = body;

  const wantsDeactivate = isActive === false;
  const wantsStructural = number !== undefined || floorId !== undefined;

  if (wantsDeactivate || wantsStructural) {
    const current = await query<{ number: string; floor_id: string }>(
      `SELECT number, floor_id FROM parking_boxes WHERE id = $1 AND branch_id = $2`,
      [id, context!.branchId],
    );
    if (current.length === 0) {
      return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
    }

    const nextNumber =
      number !== undefined ? number.trim().toUpperCase() : current[0]!.number;
    const nextFloor = floorId ?? current[0]!.floor_id;
    const movesBox = nextNumber !== current[0]!.number || nextFloor !== current[0]!.floor_id;

    if (wantsDeactivate || movesBox) {
      const open = await query<{ id: string }>(
        `SELECT id FROM parking_sessions WHERE box_id = $1 AND status = 'open'`,
        [id],
      );
      if (open.length > 0) {
        return NextResponse.json(
          {
            error: wantsDeactivate
              ? "No podés dar de baja un box con una estadía abierta"
              : "No podés cambiar el número o el piso de un box con una estadía abierta",
          },
          { status: 400 },
        );
      }
    }
  }

  const updates: string[] = ["updated_at = now()", "version = version + 1"];
  const params: unknown[] = [id, context!.branchId];

  if (number !== undefined) {
    const clean = number.trim().toUpperCase();
    if (!clean || clean.length > 12) {
      return NextResponse.json({ error: "Número de box inválido" }, { status: 400 });
    }
    params.push(clean);
    updates.push(`number = $${params.length}`);
  }
  if (sector !== undefined) {
    params.push(sector.trim() || null);
    updates.push(`sector = $${params.length}`);
  }
  if (floorId !== undefined) {
    params.push(floorId);
    updates.push(`floor_id = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(isActive);
    updates.push(`is_active = $${params.length}`);
  }

  try {
    const rows = await query<BoxRow>(
      `UPDATE parking_boxes SET ${updates.join(", ")}
        WHERE id = $1 AND branch_id = $2
        RETURNING id, number, sector, floor_id, is_active`,
      params,
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'box.update', 'parking_box', $3, $4::jsonb)`,
      [
        context!.user.userId,
        context!.branchId,
        id,
        JSON.stringify({ number, sector, floorId, isActive }),
      ],
    );

    return NextResponse.json({ ok: true, box: rows[0] });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un box con ese número" },
          { status: 409 },
        );
      }
      if ((err as { code?: string }).code === "23503") {
        return NextResponse.json({ error: "El piso indicado no existe" }, { status: 400 });
      }
    }
    return rpcErrorResponse(err);
  }
}
