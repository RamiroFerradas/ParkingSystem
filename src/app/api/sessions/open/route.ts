import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { normalizePlate } from "@/lib/plate";

interface OpenResult {
  session_id: string;
  ticket_number: string;
  vehicle_id: string;
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

  const { sessionId, plate, vehicleTypeId, boxId, notes } = body;
  if (
    typeof sessionId !== "string" ||
    typeof plate !== "string" ||
    typeof vehicleTypeId !== "string" ||
    typeof boxId !== "string"
  ) {
    return NextResponse.json(
      { error: "Faltan datos del ingreso" },
      { status: 400 },
    );
  }

  const cleanPlate = normalizePlate(plate);
  if (!cleanPlate) {
    return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
  }

  try {
    const rows = await query<{ r: OpenResult }>(
      `SELECT open_session($1, $2, $3, $4, $5, $6) AS r`,
      [
        sessionId,
        cleanPlate,
        vehicleTypeId,
        boxId,
        user.userId,
        typeof notes === "string" && notes.length > 0 ? notes : null,
      ],
    );
    const r = rows[0]!.r;
    return NextResponse.json({
      ok: true,
      sessionId: r.session_id,
      ticketNumber: Number(r.ticket_number),
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
