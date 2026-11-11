import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";

/** Cerrar turno de caja (manual; puede cerrarlo otro usuario — BR-022). */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let notes: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.notes === "string" && body.notes.length > 0) notes = body.notes;
  } catch {
    // cuerpo opcional
  }

  try {
    const rows = await query<{ id: string }>(
      `UPDATE cash_shifts
          SET status = 'closed', closed_by = $1, closed_at = now(), closing_notes = $2
        WHERE status = 'open'
        RETURNING id`,
      [user.userId, notes],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "No hay turno abierto" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, shiftId: rows[0]!.id });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
