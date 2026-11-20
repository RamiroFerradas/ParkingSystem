import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Cerrar el turno abierto.
 * - El empleado solo puede cerrar el turno que abrió; admin/supervisor, cualquiera.
 * - No se cierra si quedan vehículos sin egreso: la facturación quedaría partida.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "shift.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para gestionar turnos de caja" },
      { status: 403 },
    );
  }

  let notes: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.notes === "string" && body.notes.length > 0) notes = body.notes;
  } catch {
    // cuerpo opcional
  }

  const open = await query<{ id: string; opened_by: string }>(
    `SELECT id, opened_by FROM cash_shifts WHERE status = 'open' LIMIT 1`,
  );
  const shift = open[0];
  if (!shift) {
    return NextResponse.json({ error: "No hay turno abierto" }, { status: 400 });
  }

  const canCloseAny = user.role === "admin" || user.role === "supervisor";
  if (!canCloseAny && shift.opened_by !== user.userId) {
    return NextResponse.json(
      { error: "Solo podés cerrar el turno que abriste." },
      { status: 403 },
    );
  }

  const pending = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM parking_sessions
      WHERE shift_id = $1 AND status = 'open'`,
    [shift.id],
  );
  const openSessions = Number(pending[0]?.count ?? 0);
  if (openSessions > 0) {
    return NextResponse.json(
      {
        code: "SHIFT_HAS_OPEN_SESSIONS",
        openSessions,
        error: `Hay ${openSessions} vehículo${openSessions === 1 ? "" : "s"} sin egreso en este turno. Registrá el egreso antes de cerrarlo.`,
      },
      { status: 409 },
    );
  }

  try {
    const rows = await query<{ id: string }>(
      `UPDATE cash_shifts
          SET status = 'closed', closed_by = $1, closed_at = now(), closing_notes = $2
        WHERE id = $3 AND status = 'open'
        RETURNING id`,
      [user.userId, notes, shift.id],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "No hay turno abierto" }, { status: 400 });
    }
    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
       VALUES (gen_random_uuid(), $1, 'shift.close', 'cash_shift', $2)`,
      [user.userId, rows[0]!.id],
    );
    return NextResponse.json({ ok: true, shiftId: rows[0]!.id });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
