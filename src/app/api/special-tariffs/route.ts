import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { hasPermission } from "@/lib/auth/permissions";
import {
  cancelSpecialTariffSchema,
  createSpecialTariffSchema,
  type CancelSpecialTariffPayload,
  type CreateSpecialTariffPayload,
} from "@/lib/schemas/money";

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

/** Los períodos son por sucursal: nunca se toman de un query string. */
function branchOf(user: { branchId: string | null }): string | null {
  return user.branchId ?? null;
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.read"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal para gestionar tarifas" }, { status: 400 });
  }
  try {
    const rows = await query<SpecialRow>(
      `SELECT id, name, starts_at::text, ends_at::text, vehicle_type_ids,
              adjustment_type::text AS adjustment_type, adjustment_value::text, priority,
              status::text AS status
         FROM special_tariff_periods
        WHERE branch_id = $1
        ORDER BY starts_at DESC
        LIMIT 100`,
      [branchId],
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
  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal para gestionar tarifas" }, { status: 400 });
  }

  const { data: body, error: bodyError } = await parseBody<CreateSpecialTariffPayload>(
    request,
    createSpecialTariffSchema,
    "Datos del período inválidos",
  );
  if (bodyError) return bodyError;

  const { name, startsAt, endsAt, adjustmentType, adjustmentValue, priority, vehicleTypeIds } = body;

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
          (name, starts_at, ends_at, vehicle_type_ids, adjustment_type, adjustment_value, priority, branch_id)
       VALUES ($1, $2, $3, $4::uuid[], $5::special_adjustment_type, $6, $7, $8)
       RETURNING id`,
      [name, start.toISOString(), end.toISOString(), vehicleTypeIds, adjustmentType, adjustmentValue, priority, branchId],
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
  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal para gestionar tarifas" }, { status: 400 });
  }

  const { data: body, error: bodyError } = await parseBody<CancelSpecialTariffPayload>(
    request,
    cancelSpecialTariffSchema,
    "Solo se puede cancelar un período",
  );
  if (bodyError) return bodyError;

  const { id } = body;

  try {
    const rows = await query<{ id: string }>(
      `UPDATE special_tariff_periods
          SET status = 'cancelled', updated_at = now(), version = version + 1
        WHERE id = $1 AND branch_id = $2 AND status IN ('scheduled', 'active')
        RETURNING id`,
      [id, branchId],
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
