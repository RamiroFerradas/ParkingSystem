import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

const PG_UNIQUE = "23505";

interface MethodRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

/** CRUD de medios de pago. Solo roles con tariff.manage (config económica). */

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.read"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  try {
    const rows = await query<MethodRow>(
      `SELECT id, code, name, is_active, sort_order FROM payment_methods ORDER BY sort_order, name`,
    );
    return NextResponse.json({ methods: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!code || code.length > 20 || !name || name.length > 40) {
    return NextResponse.json(
      { error: "Código (hasta 20) y nombre (hasta 40) requeridos" },
      { status: 400 },
    );
  }

  try {
    const rows = await query<MethodRow>(
      `INSERT INTO payment_methods (code, name, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(max(sort_order), 0) + 1 FROM payment_methods))
       RETURNING id, code, name, is_active, sort_order`,
      [code, name],
    );
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'payment_method.create', 'payment_method', $2,
               jsonb_build_object('code', $3::text, 'name', $4::text))`,
      [user.userId, rows[0]!.id, code, name],
    );
    return NextResponse.json({ ok: true, method: rows[0] }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un medio con ese código o nombre" },
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
  if (!(await hasPermission(user, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { id, name, isActive } = body;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Falta el medio de pago" }, { status: 400 });
  }

  try {
    const rows = await query<MethodRow>(
      `UPDATE payment_methods SET
          name = COALESCE($2, name),
          is_active = COALESCE($3, is_active)
        WHERE id = $1
        RETURNING id, code, name, is_active, sort_order`,
      [id, typeof name === "string" && name.trim() ? name.trim() : null, typeof isActive === "boolean" ? isActive : null],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Medio de pago inexistente" }, { status: 404 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'payment_method.update', 'payment_method', $2, $3::jsonb)`,
      [user.userId, id, JSON.stringify({ name, isActive })],
    );
    return NextResponse.json({ ok: true, method: rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
