import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

/** Activar/desactivar box (fuera de servicio). Solo roles con box.manage. */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  if (!(await hasPermission(user, "box.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar boxes" },
      { status: 403 },
    );
  }

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
          SET is_service_enabled = $2, updated_at = now()
        WHERE id = $1
        RETURNING is_service_enabled`,
      [boxId, serviceEnabled],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'parking_box', $3,
               jsonb_build_object('is_service_enabled', $4::boolean))`,
      [user.userId, serviceEnabled ? "box.enable" : "box.disable", boxId, serviceEnabled],
    );

    return NextResponse.json({ ok: true, isServiceEnabled: rows[0]!.is_service_enabled });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
