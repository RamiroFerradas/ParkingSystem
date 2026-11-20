import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

const PG_UNIQUE = "23505";

interface BoxRow {
  id: string;
  number: string;
  sector: string | null;
  floor_id: string;
  is_active: boolean;
}

async function requireAdmin() {
  const { user, error } = await requireUser();
  if (error) return { user: null, response: error };
  if (!(await hasPermission(user, "box.manage"))) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Solo el administrador puede modificar la estructura de boxes" },
        { status: 403 },
      ),
    };
  }
  return { user, response: null };
}

/** Dar de alta un box individual en un piso. */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { floorId, number, sector } = body;
  const cleanNumber = typeof number === "string" ? number.trim().toUpperCase() : "";

  if (typeof floorId !== "string" || !cleanNumber || cleanNumber.length > 12) {
    return NextResponse.json(
      { error: "Necesito el piso y un número de box (hasta 12 caracteres)" },
      { status: 400 },
    );
  }

  try {
    const rows = await query<BoxRow>(
      `INSERT INTO parking_boxes (number, sector, floor_id)
       VALUES ($1, $2, $3)
       RETURNING id, number, sector, floor_id, is_active`,
      [cleanNumber, typeof sector === "string" && sector.trim() ? sector.trim() : null, floorId],
    );

    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'box.create', 'parking_box', $2,
               jsonb_build_object('number', $3::text, 'floor_id', $4::text))`,
      [user!.userId, rows[0]!.id, cleanNumber, floorId],
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
  const { user, response } = await requireAdmin();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { id, number, sector, floorId, isActive } = body;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Falta el box" }, { status: 400 });
  }

  const wantsDeactivate = isActive === false;
  const wantsStructural = typeof number === "string" || typeof floorId === "string";

  if (wantsDeactivate || wantsStructural) {
    const current = await query<{ number: string; floor_id: string }>(
      `SELECT number, floor_id FROM parking_boxes WHERE id = $1`,
      [id],
    );
    if (current.length === 0) {
      return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
    }

    const nextNumber =
      typeof number === "string" ? number.trim().toUpperCase() : current[0]!.number;
    const nextFloor = typeof floorId === "string" ? floorId : current[0]!.floor_id;
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
  const params: unknown[] = [id];

  if (typeof number === "string") {
    const clean = number.trim().toUpperCase();
    if (!clean || clean.length > 12) {
      return NextResponse.json({ error: "Número de box inválido" }, { status: 400 });
    }
    params.push(clean);
    updates.push(`number = $${params.length}`);
  }
  if (typeof sector === "string") {
    params.push(sector.trim() ? sector.trim() : null);
    updates.push(`sector = $${params.length}`);
  }
  if (typeof floorId === "string") {
    params.push(floorId);
    updates.push(`floor_id = $${params.length}`);
  }
  if (typeof isActive === "boolean") {
    params.push(isActive);
    updates.push(`is_active = $${params.length}`);
  }

  try {
    const rows = await query<BoxRow>(
      `UPDATE parking_boxes SET ${updates.join(", ")} WHERE id = $1
       RETURNING id, number, sector, floor_id, is_active`,
      params,
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'box.update', 'parking_box', $2, $3::jsonb)`,
      [user!.userId, id, JSON.stringify({ number, sector, floorId, isActive })],
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
