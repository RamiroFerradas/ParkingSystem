import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";

interface CloseResult {
  session_id: string;
  duration_minutes: number;
  final_cents: string;
  ticket?: never;
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { sessionId, methodId, notes } = body;
  if (typeof sessionId !== "string" || typeof methodId !== "string") {
    return NextResponse.json(
      { error: "Faltan datos del cobro" },
      { status: 400 },
    );
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
    const r = rows[0]!.r;
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
