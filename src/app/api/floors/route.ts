import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";

const PG_UNIQUE = "23505";

interface FloorRow {
  id: string;
  name: string;
  sort_order: number;
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

/** Crear piso + generación masiva de boxes en una sola sentencia atómica. */
export async function POST(request: Request) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const boxCount = typeof body.boxCount === "number" ? Math.floor(body.boxCount) : 0;
  const prefix = typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : "";
  const sortOrder = typeof body.sortOrder === "number" ? Math.floor(body.sortOrder) : 0;

  if (!name || name.length > 50) {
    return NextResponse.json({ error: "Nombre de piso inválido" }, { status: 400 });
  }
  if (boxCount < 0 || boxCount > 120) {
    return NextResponse.json({ error: "Cantidad de boxes fuera de rango (0–120)" }, { status: 400 });
  }
  if (boxCount > 0 && (!prefix || prefix.length > 8 || !/^[A-Z0-9]+$/.test(prefix))) {
    return NextResponse.json(
      { error: "Prefijo requerido (letras/números, hasta 8)" },
      { status: 400 },
    );
  }

  try {
    const client = await pool.connect();
    let floorId: string;
    let floor: FloorRow;
    try {
      await client.query("BEGIN");
      const floorRes = await client.query<FloorRow>(
        `INSERT INTO parking_floors (name, sort_order, branch_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, sort_order, is_active`,
        [name, sortOrder, context!.branchId],
      );
      floor = floorRes.rows[0]!;
      floorId = floor.id;

      if (boxCount > 0) {
        const boxes = Array.from(
          { length: boxCount },
          (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`,
        );
        await client.query(
          `INSERT INTO parking_boxes (number, floor_id, branch_id)
           SELECT x, $1, $2 FROM unnest($3::text[]) AS x`,
          [floorId, context!.branchId, boxes],
        );
      }
      // Piso, boxes y auditoría en la misma transacción: si falla el log, no
      // queda un piso creado sin rastro ni un 409 en el reintento.
      await client.query(
        `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
         VALUES (gen_random_uuid(), $1, $2, 'floor.create', 'parking_floor', $3,
                 jsonb_build_object('name', $4::text, 'boxes_created', $5::int))`,
        [context!.user.userId, context!.branchId, floorId, name, boxCount],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, floor }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un piso con ese nombre o un box con ese número" },
          { status: 409 },
        );
      }
    }
    return rpcErrorResponse(err);
  }
}

/** Editar piso: nombre, orden o alta/baja. */
export async function PATCH(request: Request) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { id, name, sortOrder, isActive } = body;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Falta el piso" }, { status: 400 });
  }

  const updates: string[] = ["updated_at = now()", "version = version + 1"];
  const params: unknown[] = [id, context!.branchId];

  if (typeof name === "string") {
    if (!name.trim() || name.trim().length > 50) {
      return NextResponse.json({ error: "Nombre de piso inválido" }, { status: 400 });
    }
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (typeof sortOrder === "number") {
    params.push(Math.floor(sortOrder));
    updates.push(`sort_order = $${params.length}`);
  }
  if (typeof isActive === "boolean") {
    params.push(isActive);
    updates.push(`is_active = $${params.length}`);
  }

  try {
    const rows = await query<FloorRow>(
      `UPDATE parking_floors SET ${updates.join(", ")}
        WHERE id = $1 AND branch_id = $2
        RETURNING id, name, sort_order, is_active`,
      params,
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Piso inexistente" }, { status: 404 });
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'floor.update', 'parking_floor', $3, $4::jsonb)`,
      [
        context!.user.userId,
        context!.branchId,
        id,
        JSON.stringify({ name, sortOrder, isActive }),
      ],
    );

    return NextResponse.json({ ok: true, floor: rows[0] });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un piso con ese nombre" },
          { status: 409 },
        );
      }
    }
    return rpcErrorResponse(err);
  }
}
