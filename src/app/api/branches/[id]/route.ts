import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";

async function requireMaster() {
  const context = await getBranchContext();
  if (!context) {
    return {
      context: null,
      response: NextResponse.json({ error: "Sesión requerida" }, { status: 401 }),
    };
  }
  if (!context.isMaster) {
    return {
      context: null,
      response: NextResponse.json({ error: "Acceso restringido" }, { status: 403 }),
    };
  }
  return { context, response: null };
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireMaster();
  if (response) return response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const updates: string[] = ["updated_at = now()", "version = version + 1"];
  const values: unknown[] = [id];

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    values.push(name);
    updates.push(`name = $${values.length}`);
  }
  if (typeof body.code === "string") {
    values.push(body.code.trim() || null);
    updates.push(`code = $${values.length}`);
  }
  if (typeof body.isActive === "boolean") {
    values.push(body.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  try {
    const rows = await query<{ id: string; name: string; code: string | null; is_active: boolean }>(
      `UPDATE branches SET ${updates.join(", ")} WHERE id = $1
       RETURNING id, name, code, is_active`,
      values,
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Sucursal inexistente" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, branch: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("uq_branches_name") || message.includes("uq_branches_code")) {
      return NextResponse.json(
        { error: "Ya existe una sucursal con ese nombre o código." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { response } = await requireMaster();
  if (response) return response;

  const { id } = await params;

  const counts = await query<{
    boxes: number;
    sessions: number;
    shifts: number;
    tariffs: number;
    members: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM parking_boxes      WHERE branch_id = $1) AS boxes,
       (SELECT count(*)::int FROM parking_sessions   WHERE branch_id = $1) AS sessions,
       (SELECT count(*)::int FROM cash_shifts        WHERE branch_id = $1) AS shifts,
       (SELECT count(*)::int FROM parking_tariffs    WHERE branch_id = $1) AS tariffs,
       (SELECT count(*)::int FROM user_branches      WHERE branch_id = $1) AS members`,
    [id],
  );
  const used = counts[0];
  if (!used) {
    return NextResponse.json({ error: "Sucursal inexistente" }, { status: 404 });
  }

  const total = used.boxes + used.sessions + used.shifts + used.tariffs + used.members;
  if (total > 0) {
    return NextResponse.json(
      {
        error:
          "La sucursal tiene datos (boxes, estadías, turnos, tarifas o usuarios). Desactivala en vez de eliminarla.",
        counts: used,
      },
      { status: 409 },
    );
  }

  const remaining = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM branches WHERE id <> $1",
    [id],
  );
  if ((remaining[0]?.n ?? 0) === 0) {
    return NextResponse.json(
      { error: "Tiene que quedar al menos una sucursal." },
      { status: 409 },
    );
  }

  await query("DELETE FROM branches WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
