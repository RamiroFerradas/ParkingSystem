import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createTariffSchema,
  updateTariffSchema,
  type CreateTariffPayload,
  type UpdateTariffPayload,
} from "@/lib/schemas/money";

const PG_UNIQUE = "23505";

interface TariffRow {
  id: string;
  kind: string;
  code: string | null;
  name: string;
  description: string | null;
  vehicle_type_id: string;
  vehicle_type_name: string;
  duration_minutes: number | null;
  duration_mode: string;
  amount_cents: string;
  is_active: boolean;
  valid_from: string;
  valid_to: string | null;
  valid_from_local: string;
  valid_to_local: string | null;
}

/** Bloque tarifario: nombre legible a partir de la duración. */
function durationLabel(minutes: number) {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

/** Sucursal activa del usuario; sin sucursal no se opera el tarifario. */
function branchOf(user: { branchId: string | null }): string | null {
  return user.branchId ?? null;
}

const ABSENT = Symbol("absent");
const INVALID = Symbol("invalid");
type ParsedDate = Date | null | typeof ABSENT | typeof INVALID;

/** ABSENT = campo ausente; null = sin límite; INVALID = formato inválido. */
function parseDate(value: unknown): ParsedDate {
  if (value === undefined) return ABSENT;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return INVALID;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? INVALID : date;
}

/** CRUD de bloques tarifarios. Solo roles con tariff.manage. */
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
    const rows = await query<TariffRow>(
      `SELECT t.id, t.kind::text AS kind, t.code, t.name, t.description, t.vehicle_type_id,
              vt.name AS vehicle_type_name,
              t.duration_minutes, t.duration_mode::text AS duration_mode, t.amount_cents::text, t.is_active,
              t.valid_from, t.valid_to,
              to_char(t.valid_from AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI') AS valid_from_local,
              CASE WHEN t.valid_to IS NULL THEN NULL
                   ELSE to_char(t.valid_to AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI')
              END AS valid_to_local
         FROM parking_tariffs t
         JOIN vehicle_types vt ON vt.id = t.vehicle_type_id
        WHERE t.branch_id = $1
        ORDER BY vt.sort_order, t.kind, t.duration_minutes NULLS LAST, t.valid_from DESC`,
      [branchId],
    );
    return NextResponse.json({ tariffs: rows });
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

  const { data: body, error: bodyError } = await parseBody<CreateTariffPayload>(
    request,
    createTariffSchema,
    "Datos de tarifa inválidos",
  );
  if (bodyError) return bodyError;

  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal para gestionar tarifas" }, { status: 400 });
  }

  // `code` y `name` se aceptan por compatibilidad con clientes viejos; la UI
  // nueva ya no los pide y el nombre se autogenera desde el tipo y la duración.
  const { code, name: requestedName, description, vehicleTypeId, kind, durationMinutes, amountCents } =
    body;
  const isMonthly = kind === "monthly";

  const parsedFrom = parseDate(body.validFrom);
  const parsedTo = parseDate(body.validTo);
  if (parsedFrom === INVALID) {
    return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
  }
  if (parsedTo === INVALID) {
    return NextResponse.json({ error: "Fecha de fin inválida" }, { status: 400 });
  }
  const validFrom = parsedFrom instanceof Date ? parsedFrom : new Date();
  const validTo = parsedTo instanceof Date ? parsedTo : null;

  if (!vehicleTypeId) {
    return NextResponse.json({ error: "Falta el tipo de vehículo" }, { status: 400 });
  }
  if (code && code.length > 20) {
    return NextResponse.json({ error: "Código demasiado largo" }, { status: 400 });
  }
  if (!isMonthly && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
    return NextResponse.json({ error: "La duración debe ser un entero positivo (minutos)" }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return NextResponse.json({ error: "Monto inválido (centavos)" }, { status: 400 });
  }
  if (validTo && validTo <= validFrom) {
    return NextResponse.json(
      { error: "La vigencia debe terminar después de empezar" },
      { status: 400 },
    );
  }

  try {
    const types = await query<{ name: string }>(
      `SELECT name FROM vehicle_types WHERE id = $1 AND is_active`,
      [vehicleTypeId],
    );
    if (types.length === 0) {
      return NextResponse.json({ error: "El tipo de vehículo indicado no existe" }, { status: 400 });
    }
    const name =
      requestedName && requestedName.length <= 60
        ? requestedName
        : isMonthly
          ? `${types[0]!.name} abono mensual`
          : `${types[0]!.name} ${durationLabel(durationMinutes)}`;

    const rows = await query<{ id: string }>(
      `INSERT INTO parking_tariffs
         (branch_id, kind, code, name, description, vehicle_type_id, duration_minutes,
          duration_mode, amount_cents, valid_from, valid_to)
       VALUES ($1, $2::tariff_kind, $3, $4, $5, $6, $7, 'flat', $8, $9, $10)
       RETURNING id`,
      [
        branchId,
        kind,
        code,
        name,
        description,
        vehicleTypeId,
        isMonthly ? null : durationMinutes,
        amountCents,
        validFrom,
        validTo,
      ],
    );
    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'tariff.create', 'parking_tariff', $3,
               jsonb_build_object('name', $4::text, 'kind', $5::text,
                                  'amount_cents', $6::bigint,
                                  'valid_from', $7::text, 'valid_to', $8::text))`,
      [
        user.userId,
        branchId,
        rows[0]!.id,
        name,
        kind,
        amountCents,
        validFrom.toISOString(),
        validTo ? validTo.toISOString() : null,
      ],
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
  if (!(await hasPermission(user, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  const { data: body, error: bodyError } = await parseBody<UpdateTariffPayload>(
    request,
    updateTariffSchema,
    "Falta la tarifa",
  );
  if (bodyError) return bodyError;

  const { id, amountCents, isActive, validFrom, validTo } = body;
  if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents < 0)) {
    return NextResponse.json({ error: "Monto inválido (centavos)" }, { status: 400 });
  }

  const hasFrom = validFrom !== undefined;
  const hasTo = validTo !== undefined;
  const parsedFrom = parseDate(validFrom);
  const parsedTo = parseDate(validTo);
  if (parsedFrom === INVALID || parsedFrom === null) {
    return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
  }
  if (parsedTo === INVALID) {
    return NextResponse.json({ error: "Fecha de fin inválida" }, { status: 400 });
  }

  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal para gestionar tarifas" }, { status: 400 });
  }

  try {
    const current = await query<{ valid_from: string; valid_to: string | null; branch_id: string }>(
      `SELECT valid_from, valid_to, branch_id FROM parking_tariffs WHERE id = $1`,
      [id],
    );
    if (current.length === 0 || current[0]!.branch_id !== branchId) {
      return NextResponse.json({ error: "Tarifa inexistente" }, { status: 404 });
    }
    const effectiveFrom =
      hasFrom && parsedFrom instanceof Date ? parsedFrom : new Date(current[0]!.valid_from);
    const effectiveTo = hasTo
      ? parsedTo instanceof Date
        ? parsedTo
        : null
      : current[0]!.valid_to
        ? new Date(current[0]!.valid_to)
        : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      return NextResponse.json(
        { error: "La vigencia debe terminar después de empezar" },
        { status: 400 },
      );
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      params.push(value);
      sets.push(sql.replace("$?", `$${params.length}`));
    };
    if (amountCents !== undefined) push("amount_cents = $?", Number(amountCents));
    if (typeof isActive === "boolean") push("is_active = $?", isActive);
    if (hasFrom) push("valid_from = $?", parsedFrom);
    if (hasTo) push("valid_to = $?", parsedTo instanceof Date ? parsedTo : null);

    if (sets.length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }
    sets.push("updated_at = now()", "version = version + 1");
    params.push(id);

    const rows = await query<{ id: string }>(
      `UPDATE parking_tariffs SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Tarifa inexistente" }, { status: 404 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'tariff.update', 'parking_tariff', $3, $4::jsonb)`,
      [
        user.userId,
        branchId,
        id,
        JSON.stringify({
          amountCents,
          isActive,
          validFrom: hasFrom && parsedFrom instanceof Date ? parsedFrom.toISOString() : undefined,
          validTo: hasTo ? (parsedTo instanceof Date ? parsedTo.toISOString() : null) : undefined,
        }),
      ],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
