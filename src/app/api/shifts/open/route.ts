import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

/** Abrir turno de caja (BR-022: manual; lo abre un usuario, lo cierra otro). */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user.role, "shift.manage"))) {
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

  try {
    const rows = await query<{ id: string; opened_at: string }>(
      `INSERT INTO cash_shifts (id, opened_by, opening_notes)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING id, opened_at`,
      [user.userId, notes],
    );
    return NextResponse.json({ ok: true, shiftId: rows[0]!.id, openedAt: rows[0]!.opened_at });
  } catch (err) {
    if (err instanceof Error && err.message.includes("uq_open_cash_shift")) {
      return NextResponse.json(
        { error: "Ya hay un turno abierto. Cerralo antes de abrir otro." },
        { status: 400 },
      );
    }
    return rpcErrorResponse(err);
  }
}
