import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { hasPermission } from "@/lib/auth/permissions";
import { DATE_RE } from "@/lib/schemas/common";
import {
  cancelSubscriptionSchema,
  createSubscriptionSchema,
  type CancelSubscriptionPayload,
  type CreateSubscriptionPayload,
} from "@/lib/schemas/money";

const TZ = "America/Argentina/Cordoba";

interface MonthlyPlan {
  id: string;
  amount_cents: string;
  vehicle_type_id: string;
  vehicle_type_name: string;
  name: string;
}

function branchOf(user: { branchId: string | null }): string | null {
  return user.branchId ?? null;
}

/** Listado de abonos de la sucursal (vigentes, vencidos y cancelados). */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal" }, { status: 400 });
  }

  try {
    const rows = await query<{
      id: string;
      plate: string;
      vehicle_type: string;
      plan_name: string;
      starts_on: string;
      ends_on: string;
      amount_cents: string;
      status: string;
      vigente: boolean;
      created_by_name: string;
      created_at: string;
      notes: string | null;
    }>(
      `SELECT s.id, v.plate, vt.name AS vehicle_type, t.name AS plan_name,
              s.starts_on::text, s.ends_on::text, s.amount_cents::text,
              s.status::text, s.notes, s.created_at::text,
              p.email AS created_by_name,
              (s.status = 'active'
               AND s.starts_on <= (now() AT TIME ZONE '${TZ}')::date
               AND s.ends_on >= (now() AT TIME ZONE '${TZ}')::date) AS vigente
         FROM subscriptions s
         JOIN vehicles v        ON v.id = s.vehicle_id
         JOIN vehicle_types vt  ON vt.id = v.vehicle_type_id
         JOIN parking_tariffs t ON t.id = s.tariff_id
         JOIN profiles p        ON p.id = s.created_by
        WHERE s.branch_id = $1
        ORDER BY s.status, s.ends_on DESC, s.created_at DESC
        LIMIT 300`,
      [branchId],
    );
    return NextResponse.json({ subscriptions: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

/** Alta de abono: patente + plan mensual + período. Cobra en el turno abierto. */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal" }, { status: 400 });
  }

  const { data: body, error: bodyError } = await parseBody<CreateSubscriptionPayload>(
    request,
    createSubscriptionSchema,
    "Datos del abono inválidos",
  );
  if (bodyError) return bodyError;

  const { plate, tariffId, startsOn, endsOn, methodId, notes } = body;

  if (!plate) {
    return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
  }
  if (!tariffId) {
    return NextResponse.json({ error: "Elegí el plan mensual" }, { status: 400 });
  }
  if (!DATE_RE.test(startsOn) || !DATE_RE.test(endsOn)) {
    return NextResponse.json({ error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
  }
  if (endsOn < startsOn) {
    return NextResponse.json({ error: "El fin debe ser posterior al inicio" }, { status: 400 });
  }
  if (!methodId) {
    return NextResponse.json({ error: "Elegí el medio de pago" }, { status: 400 });
  }

  const plans = await query<MonthlyPlan>(
    `SELECT t.id, t.amount_cents::text, t.vehicle_type_id, vt.name AS vehicle_type_name, t.name
       FROM parking_tariffs t
       JOIN vehicle_types vt ON vt.id = t.vehicle_type_id
      WHERE t.id = $1 AND t.branch_id = $2 AND t.kind = 'monthly' AND t.is_active`,
    [tariffId, branchId],
  );
  const plan = plans[0];
  if (!plan) {
    return NextResponse.json(
      { error: "El plan mensual no existe o no está activo en esta sucursal" },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const shift = await client.query<{ id: string }>(
      `SELECT id FROM cash_shifts WHERE status = 'open' AND branch_id = $1 LIMIT 1`,
      [branchId],
    );
    if (shift.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          code: "NO_OPEN_SHIFT",
          error: "Abrí un turno de caja antes de cobrar un abono.",
        },
        { status: 409 },
      );
    }

    const vehicles = await client.query<{ id: string; vehicle_type_id: string }>(
      `SELECT id, vehicle_type_id FROM vehicles WHERE plate = $1 AND NOT plate_is_placeholder LIMIT 1`,
      [plate],
    );
    let vehicleId = vehicles.rows[0]?.id ?? null;
    if (vehicleId && vehicles.rows[0]!.vehicle_type_id !== plan.vehicle_type_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: `La patente ${plate} está registrada como ${plan.vehicle_type_name} pero el plan es de otro tipo.`,
        },
        { status: 400 },
      );
    }
    if (!vehicleId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO vehicles (id, plate, vehicle_type_id, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [plate, plan.vehicle_type_id, user.userId],
      );
      vehicleId = inserted.rows[0]!.id;
    }

    const nowDate = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE '${TZ}')::date::text AS today`,
    );
    const today = nowDate.rows[0]!.today;
    const overlapping = await client.query<{ id: string }>(
      `SELECT id FROM subscriptions
        WHERE branch_id = $1 AND vehicle_id = $2 AND status = 'active'
          AND starts_on <= $4::date AND ends_on >= $3::date
        LIMIT 1`,
      [branchId, vehicleId, startsOn, endsOn],
    );
    if (overlapping.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Ya hay un abono vigente para esa patente en ese período." },
        { status: 409 },
      );
    }

    const amountCents = Number(plan.amount_cents);
    const payment = await client.query<{ id: string }>(
      `INSERT INTO payments
         (id, session_id, branch_id, concept, method_id, amount_charged_cents,
          amount_calculated_cents, discount_cents, surcharge_cents, registered_by, shift_id)
       VALUES (gen_random_uuid(), NULL, $1, 'subscription', $2, $3, $3, 0, 0, $4, $5)
       RETURNING id`,
      [branchId, methodId, amountCents, user.userId, shift.rows[0]!.id],
    );

    const subscription = await client.query<{ id: string }>(
      `INSERT INTO subscriptions
         (id, branch_id, vehicle_id, tariff_id, starts_on, ends_on, amount_cents,
          payment_id, notes, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5::date, $6, $7, $8, $9)
       RETURNING id`,
      [branchId, vehicleId, plan.id, startsOn, endsOn, amountCents, payment.rows[0]!.id, notes, user.userId],
    );

    await client.query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'subscription.create', 'subscription', $3, $4::jsonb)`,
      [
        user.userId,
        branchId,
        subscription.rows[0]!.id,
        JSON.stringify({
          plate,
          tariffId: plan.id,
          startsOn,
          endsOn,
          amountCents,
          today,
        }),
      ],
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { ok: true, id: subscription.rows[0]!.id, paymentId: payment.rows[0]!.id },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "Ya hay un abono activo para esa patente." },
          { status: 409 },
        );
      }
      if ((err as { code?: string }).code === "23503") {
        return NextResponse.json({ error: "Datos del abono inválidos" }, { status: 400 });
      }
    }
    return rpcErrorResponse(err);
  } finally {
    client.release();
  }
}

/** Baja del abono (no borra: conserva el cobro y el historial). */
export async function PATCH(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "tariff.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  const branchId = branchOf(user);
  if (!branchId) {
    return NextResponse.json({ error: "Elegí una sucursal" }, { status: 400 });
  }

  const { data: body, error: bodyError } = await parseBody<CancelSubscriptionPayload>(
    request,
    cancelSubscriptionSchema,
    "Falta el abono",
  );
  if (bodyError) return bodyError;
  const { id } = body;

  try {
    const rows = await query<{ id: string }>(
      `UPDATE subscriptions
          SET status = 'cancelled', cancelled_at = now()
        WHERE id = $1 AND branch_id = $2 AND status = 'active'
        RETURNING id`,
      [id, branchId],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Abono inexistente o ya cancelado" }, { status: 404 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id)
       VALUES (gen_random_uuid(), $1, $2, 'subscription.cancel', 'subscription', $3)`,
      [user.userId, branchId, id],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
