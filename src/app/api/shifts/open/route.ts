import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { parseOptionalBody } from "@/lib/api/body";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { openShiftSchema, type OpenShiftPayload } from "@/lib/schemas/operations";

/** Abrir turno de caja de la sucursal activa (manual, con shift.manage). */
export async function POST(request: Request) {
  const { context, error } = await getBranchContextOrFail("shift.manage");
  if (error) return NextResponse.json(error.body, { status: error.status });

  const { data: body, error: bodyError } = await parseOptionalBody<OpenShiftPayload>(
    request,
    openShiftSchema,
    "Datos del turno inválidos",
  );
  if (bodyError) return bodyError;

  const notes =
    typeof body.notes === "string" && body.notes.length > 0 ? body.notes : null;

  try {
    const rows = await query<{ id: string; opened_at: string }>(
      `INSERT INTO cash_shifts (id, opened_by, branch_id, opening_notes)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING id, opened_at`,
      [context.user.userId, context.branchId, notes],
    );
    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id)
       VALUES (gen_random_uuid(), $1, $2, 'shift.open', 'cash_shift', $3)`,
      [context.user.userId, context.branchId, rows[0]!.id],
    );
    return NextResponse.json({ ok: true, shiftId: rows[0]!.id, openedAt: rows[0]!.opened_at });
  } catch (err) {
    if (err instanceof Error && err.message.includes("uq_open_cash_shift")) {
      return NextResponse.json(
        { error: "Ya hay un turno abierto en esta sucursal. Cerralo antes de abrir otro." },
        { status: 400 },
      );
    }
    return rpcErrorResponse(err);
  }
}
