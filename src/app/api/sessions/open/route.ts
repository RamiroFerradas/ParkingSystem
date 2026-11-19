import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { normalizePlate } from "@/lib/plate";

interface OpenResult {
  session_id: string;
  ticket_number: string;
  vehicle_id: string;
}

interface ParkedSession {
  session_id: string;
  ticket_number: string;
  box_id: string;
  box_number: string;
  entry_at: Date;
}

async function findParked(plate: string): Promise<ParkedSession[]> {
  return query<ParkedSession>(
    `SELECT s.id AS session_id, s.ticket_number::text, s.box_id,
            b.number AS box_number, s.entry_at
       FROM parking_sessions s
       JOIN vehicles v      ON v.id = s.vehicle_id
       JOIN parking_boxes b ON b.id = s.box_id
      WHERE s.status = 'open' AND v.plate = $1
      LIMIT 1`,
    [plate],
  );
}

/** Respuesta 409 para una patente que ya está estacionada (misma o distinta box). */
function vehicleParkedResponse(
  plate: string,
  current: ParkedSession,
  boxId: string,
): NextResponse {
  const sameBox = current.box_id === boxId;
  return NextResponse.json(
    {
      code: "VEHICLE_PARKED",
      error: sameBox
        ? `La patente ${plate} ya está en el box ${current.box_number}.`
        : `La patente ${plate} ya está estacionada en el box ${current.box_number}.`,
      sameBox,
      session: {
        id: current.session_id,
        ticketNumber: Number(current.ticket_number),
        boxId: current.box_id,
        boxNumber: current.box_number,
        entryAt: current.entry_at,
      },
    },
    { status: 409 },
  );
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

  // Si la patente ya está estacionada, no se crea una segunda estadía: la UI
  // necesita saber dónde está para ofrecer moverla al box elegido.
  const parked = await findParked(cleanPlate);
  if (parked.length > 0) {
    return vehicleParkedResponse(cleanPlate, parked[0]!, boxId);
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
    const message = err instanceof Error ? err.message : "";

    // Carrera: otra terminal abrió la misma patente entre el pre-check y el INSERT.
    if (message.includes("El box ya está ocupado")) {
      const races = await findParked(cleanPlate);
      if (races.length > 0) {
        return vehicleParkedResponse(cleanPlate, races[0]!, boxId);
      }
      const boxRows = await query<{ number: string }>(
        `SELECT number FROM parking_boxes WHERE id = $1`,
        [boxId],
      );
      const number = boxRows[0]?.number;
      return NextResponse.json(
        {
          code: "BOX_TAKEN",
          error: number
            ? `El box ${number} ya está ocupado.`
            : "El box ya está ocupado.",
        },
        { status: 409 },
      );
    }

    return rpcErrorResponse(err);
  }
}
