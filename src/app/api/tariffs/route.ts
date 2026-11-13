import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

const PG_UNIQUE = "23505";
const MODES = ["flat", "per_block", "per_hour"] as const;

interface TariffRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  vehicle_type_id: string;
  vehicle_type_name: string;
  duration_minutes: number;
  duration_mode: string;
  amount_cents: string;
  is_active: boolean;
}

/** CRUD de productos tarifarios. Solo roles con tariff.manage. */

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user.role, "tariff.read"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  try {
    const rows = await query<TariffRow>(
      `SELECT t.id, t.code, t.name, t.description, t.vehicle_type_id, vt.name AS vehicle_type_name,
              t.duration_minutes, t.duration_mode::text AS duration_mode, t.amount_cents::text, t.is_active
         FROM parking_tariffs t
         JOIN vehicle_types vt ON vt.id = t.vehicle_type_id
        ORDER BY vt.sort_order, t.duration_minutes`,
    );
    return NextResponse.json({ tariffs: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user.role, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const code = typeof body.code === "string" && body.code.trim() ? body.code.trim() : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  const vehicleTypeId = typeof body.vehicleTypeId === "string" ? body.vehicleTypeId : "";
  const durationMinutes = Number(body.durationMinutes);
  const durationMode = typeof body.durationMode === "string" ? body.durationMode : "flat";
  const amountCents = Number(body.amountCents);

  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  if (code && code.length > 20) {
    return NextResponse.json({ error: "Código demasiado largo" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: "La duración debe ser un entero positivo (minutos)" }, { status: 400 });
  }
  if (!MODES.includes(durationMode as (typeof MODES)[number])) {
    return NextResponse.json({ error: "Modo de duración inválido" }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return NextResponse.json({ error: "Monto inválido (centavos)" }, { status: 400 });
  }

  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO parking_tariffs (code, name, description, vehicle_type_id, duration_minutes, duration_mode, amount_cents)
       VALUES ($1, $2, $3, $4, $5, $6::tariff_duration_mode, $7)
       RETURNING id`,
      [code, name, description, vehicleTypeId, durationMinutes, durationMode, amountCents],
    );
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'tariff.create', 'parking_tariff', $2,
               jsonb_build_object('name', $3::text, 'amount_cents', $4::bigint))`,
      [user.userId, rows[0]!.id, name, amountCents],
    );
    return NextResponse.json({ ok: true, id: rows[0]!.id }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json({ error: "Ya existe una tarifa con ese código" }, { status: 409 });
      }
      if ((err as { code?: string }).code === "23503") {
        return NextResponse.json({ error: "El tipo de vehículo indicado no existe" }, { status: 400 });
      }
    }
    return rpcErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user.role, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { id, name, description, amountCents, isActive } = body;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Falta la tarifa" }, { status: 400 });
  }
  if (amountCents !== undefined && (!Number.isInteger(Number(amountCents)) || Number(amountCents) < 0)) {
    return NextResponse.json({ error: "Monto inválido (centavos)" }, { status: 400 });
  }

  try {
    const rows = await query<{ id: string }>(
      `UPDATE parking_tariffs SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          amount_cents = COALESCE($4, amount_cents),
          is_active = COALESCE($5, is_active),
          updated_at = now(),
          version = version + 1
        WHERE id = $1
        RETURNING id`,
      [
        id,
        typeof name === "string" && name.trim() ? name.trim() : null,
        typeof description === "string" ? (description.trim() || null) : null,
        amountCents === undefined ? null : Number(amountCents),
        typeof isActive === "boolean" ? isActive : null,
      ],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Tarifa inexistente" }, { status: 404 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'tariff.update', 'parking_tariff', $2, $3::jsonb)`,
      [user.userId, id, JSON.stringify({ name, amountCents, isActive })],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
