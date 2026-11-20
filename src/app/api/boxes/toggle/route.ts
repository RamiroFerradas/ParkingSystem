import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";

/** Activar/desactivar box (fuera de servicio). Solo roles con box.manage. */
export async function POST(request: Request) {
  const { context, error } = await getBranchContextOrFail("box.manage");
  if (error) return NextResponse.json(error.body, { status: error.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { boxId, serviceEnabled } = body;
  if (typeof boxId !== "string" || typeof serviceEnabled !== "boolean") {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  try {
    const rows = await query<{ is_service_enabled: boolean }>(
      `UPDATE parking_boxes
          SET is_service_enabled = $3, updated_at = now()
        WHERE id = $1 AND branch_id = $2
        RETURNING is_service_enabled`,
      [boxId, context.branchId, serviceEnabled],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, $3, 'parking_box', $4,
               jsonb_build_object('is_service_enabled', $5::boolean))`,
      [
        context.user.userId,
        context.branchId,
        serviceEnabled ? "box.enable" : "box.disable",
        boxId,
        serviceEnabled,
      ],
    );

    return NextResponse.json({ ok: true, isServiceEnabled: rows[0]!.is_service_enabled });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
