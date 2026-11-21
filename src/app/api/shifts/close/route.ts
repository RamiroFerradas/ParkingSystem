import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { parseOptionalBody } from "@/lib/api/body";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { closeShiftSchema, type CloseShiftPayload } from "@/lib/schemas/operations";

/**
 * Cerrar el turno abierto de la sucursal activa.
 * - El empleado solo puede cerrar el turno que abrió; admin/supervisor, cualquiera.
 * - No se cierra si quedan vehículos sin egreso: la facturación quedaría partida.
 */
export async function POST(request: Request) {
  const { context, error } = await getBranchContextOrFail("shift.manage");
  if (error) return NextResponse.json(error.body, { status: error.status });

  const { data: body, error: bodyError } = await parseOptionalBody<CloseShiftPayload>(
    request,
    closeShiftSchema,
    "Datos del turno inválidos",
  );
  if (bodyError) return bodyError;

  const notes =
    typeof body.notes === "string" && body.notes.length > 0 ? body.notes : null;
  const force = body.force === true;

  const open = await query<{ id: string; opened_by: string }>(
    `SELECT id, opened_by FROM cash_shifts
      WHERE status = 'open' AND branch_id = $1
      LIMIT 1`,
    [context.branchId],
  );
  const shift = open[0];
  if (!shift) {
    return NextResponse.json({ error: "No hay turno abierto" }, { status: 400 });
  }

  const canCloseAny = context.role === "admin" || context.role === "supervisor";
  if (!canCloseAny && shift.opened_by !== context.user.userId) {
    return NextResponse.json(
      { error: "Solo podés cerrar el turno que abriste." },
      { status: 403 },
    );
  }

  const pending = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM parking_sessions
      WHERE branch_id = $1 AND status = 'open'`,
    [context.branchId],
  );
  const openSessions = Number(pending[0]?.count ?? 0);
  if (openSessions > 0 && !force) {
    const inside = await query<{ ticket_number: string; plate: string | null }>(
      `SELECT s.ticket_number::text, v.plate
         FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
        WHERE s.branch_id = $1 AND s.status = 'open'
        ORDER BY s.ticket_number
        LIMIT 5`,
      [context.branchId],
    );
    return NextResponse.json(
      {
        code: "SHIFT_HAS_OPEN_SESSIONS",
        openSessions,
        sessions: inside,
        error: `Hay ${openSessions} vehículo${openSessions === 1 ? "" : "s"} sin egreso. Si cerrás el turno, sus cobros quedarán en el próximo turno.`,
      },
      { status: 409 },
    );
  }

  try {
    const rows = await query<{ id: string }>(
      `UPDATE cash_shifts
          SET status = 'closed', closed_by = $1, closed_at = now(),
              closing_notes = $2, closing_open_sessions = $3
        WHERE id = $4 AND status = 'open' AND branch_id = $5
        RETURNING id`,
      [context.user.userId, notes, openSessions, shift.id, context.branchId],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "No hay turno abierto" }, { status: 400 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'shift.close', 'cash_shift', $3, $4::jsonb)`,
      [
        context.user.userId,
        context.branchId,
        rows[0]!.id,
        JSON.stringify({ open_sessions: openSessions, forced: force }),
      ],
    );
    return NextResponse.json({ ok: true, shiftId: rows[0]!.id, openSessions });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
