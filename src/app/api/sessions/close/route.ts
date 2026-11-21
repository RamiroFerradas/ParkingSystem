import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { closeSessionSchema, type CloseSessionPayload } from "@/lib/schemas/operations";

interface CloseResult {
  session_id: string;
  duration_minutes: number;
  final_cents: string;
  ticket?: never;
}

export async function POST(request: Request) {
  const { context, error } = await getBranchContextOrFail("session.close");
  if (error) return NextResponse.json(error.body, { status: error.status });
  const user = context.user;

  const { data: body, error: bodyError } = await parseBody<CloseSessionPayload>(
    request,
    closeSessionSchema,
    "Faltan datos del cobro",
  );
  if (bodyError) return bodyError;

  const { sessionId, methodId, notes } = body;

  // Un egreso solo puede tocar una estadía de la sucursal activa.
  const owned = await query<{ id: string }>(
    "SELECT id FROM parking_sessions WHERE id = $1 AND branch_id = $2",
    [sessionId, context.branchId],
  );
  if (!owned[0]) {
    return NextResponse.json({ error: "Estadía no encontrada" }, { status: 404 });
  }

  try {
    const rows = await query<{ r: CloseResult }>(
      // Descuento/recargo deshabilitados hasta resolver BR-OPEN-09 (quién autoriza y topes)
      `SELECT close_session($1, $2, $3, 0, 0, $4) AS r`,
      [
        sessionId,
        methodId,
        user.userId,
        typeof notes === "string" && notes.length > 0 ? notes : null,
      ],
    );
    const r = rows[0]?.r;
    // El RPC puede devolver NULL (o ninguna fila) sin lanzar excepción. No se
    // expone el TypeError al cliente: es un fallo del servidor, no del pedido.
    if (!r) {
      return NextResponse.json(
        { error: "No se pudo cerrar la estadía. Reintentá en unos segundos." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      sessionId: r.session_id,
      durationMinutes: r.duration_minutes,
      finalCents: Number(r.final_cents),
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
