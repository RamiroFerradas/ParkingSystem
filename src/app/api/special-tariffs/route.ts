import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

interface SpecialRow {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  vehicle_type_ids: string[];
  adjustment_type: string;
  adjustment_value: string;
  priority: number;
  status: string;
}

/** CRUD de tarifas especiales (períodos con ajuste sobre el tarifario base). */

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.read"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  try {
    const rows = await query<SpecialRow>(
      `SELECT id, name, starts_at::text, ends_at::text, vehicle_type_ids,
              adjustment_type::text AS adjustment_type, adjustment_value::text, priority,
              status::text AS status
         FROM special_tariff_periods
        ORDER BY starts_at DESC
        LIMIT 100`,
    );
    return NextResponse.json({ specials: rows });
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
  const endsAt = typeof body.endsAt === "string" ? body.endsAt : "";
  const adjustmentType = typeof body.adjustmentType === "string" ? body.adjustmentType : "";
  const adjustmentValue = Number(body.adjustmentValue);
  const priority = typeof body.priority === "number" ? Math.floor(body.priority) : 100;
  const vehicleTypeIds = Array.isArray(body.vehicleTypeIds)
    ? (body.vehicleTypeIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json(
      { error: "El fin del período debe ser posterior al inicio" },
      { status: 400 },
    );
  }
  if (!["percent", "fixed_amount"].includes(adjustmentType)) {
    return NextResponse.json({ error: "Tipo de ajuste inválido" }, { status: 400 });
  }
  if (adjustmentType === "percent" && (adjustmentValue <= 0 || adjustmentValue > 100)) {
    return NextResponse.json({ error: "El porcentaje debe estar entre 1 y 100" }, { status: 400 });
  }
  if (adjustmentType === "fixed_amount" && (!Number.isInteger(adjustmentValue) || adjustmentValue <= 0)) {
    return NextResponse.json({ error: "El recargo fijo debe ser un entero positivo (centavos)" }, { status: 400 });
  }

  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO special_tariff_periods
          (name, starts_at, ends_at, vehicle_type_ids, adjustment_type, adjustment_value, priority)
       VALUES ($1, $2, $3, $4::uuid[], $5::special_adjustment_type, $6, $7)
       RETURNING id`,
      [name, start.toISOString(), end.toISOString(), vehicleTypeIds, adjustmentType, adjustmentValue, priority],
    );
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'special.create', 'special_tariff_period', $2,
               jsonb_build_object('name', $3::text, 'adjustment', $4::text, 'value', $5::bigint))`,
      [user.userId, rows[0]!.id, name, adjustmentType, adjustmentValue],
    );
    return NextResponse.json({ ok: true, id: rows[0]!.id }, { status: 201 });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

/** Cancelar un período especial (queda como registro histórico). */
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

  const { id, status } = body;
  if (typeof id !== "string" || status !== "cancelled") {
    return NextResponse.json({ error: "Solo se puede cancelar un período" }, { status: 400 });
  }

  try {
    const rows = await query<{ id: string }>(
      `UPDATE special_tariff_periods
          SET status = 'cancelled', updated_at = now(), version = version + 1
        WHERE id = $1 AND status IN ('scheduled', 'active')
        RETURNING id`,
      [id],
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Período inexistente o ya finalizado" },
        { status: 404 },
      );
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'special.cancel', 'special_tariff_period', $2, NULL)`,
      [user.userId, id],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
