import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { normalizePlate } from "@/lib/plate";
import { openSessionSchema, type OpenSessionPayload } from "@/lib/schemas/operations";

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
  branch_id: string;
  entry_at: Date;
}

async function findParked(plate: string): Promise<ParkedSession[]> {
  return query<ParkedSession>(
    `SELECT s.id AS session_id, s.ticket_number::text, s.box_id,
            b.number AS box_number, s.branch_id, s.entry_at
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
  sameBranch: boolean,
): NextResponse {
  // Una estadía abierta en otra sucursal no expone box ni ticket: solo se
  // informa que el vehículo ya está adentro en otro lado.
  if (!sameBranch) {
    return NextResponse.json(
      {
        code: "VEHICLE_PARKED",
        error: `La patente ${plate} ya está estacionada en otra sucursal.`,
      },
      { status: 409 },
    );
  }

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
  const { context, error } = await getBranchContextOrFail("session.open");
  if (error) return NextResponse.json(error.body, { status: error.status });
  const user = context.user;
  const branchId = context.branchId;

  const { data: body, error: bodyError } = await parseBody<OpenSessionPayload>(
    request,
    openSessionSchema,
    "Faltan datos del ingreso",
  );
  if (bodyError) return bodyError;

  const { sessionId, plate, vehicleTypeId, boxId, notes, keyLeft, damageNotes } = body;

  const cleanPlate = normalizePlate(plate);
  if (!cleanPlate) {
    return NextResponse.json({ error: "Patente inválida" }, { status: 400 });
  }

  // Condición declarada al ingresar: llave que queda en el auto y roturas previas.
  const cleanDamage =
    typeof damageNotes === "string" ? damageNotes.trim().slice(0, 500).trim() : "";

  // La box debe pertenecer a la sucursal activa: el branch_id lo deriva el RPC
  // de la box, así que sin este chequeo un usuario podría ingresar en otra.
  const boxRows = await query<{ number: string }>(
    `SELECT number FROM parking_boxes WHERE id = $1 AND branch_id = $2`,
    [boxId, branchId],
  );
  if (!boxRows[0]) {
    return NextResponse.json({ error: "Box inexistente" }, { status: 404 });
  }

  // Si la patente ya está estacionada, no se crea una segunda estadía: la UI
  // necesita saber dónde está para ofrecer moverla al box elegido.
  const parked = await findParked(cleanPlate);
  if (parked.length > 0) {
    const current = parked[0]!;
    return vehicleParkedResponse(
      cleanPlate,
      current,
      boxId,
      current.branch_id === branchId,
    );
  }

  try {
    const rows = await query<{ r: OpenResult }>(
      `SELECT open_session($1, $2, $3, $4, $5, $6,
                           p_key_left => ($7::boolean),
                           p_damage_notes => ($8::text)) AS r`,
      [
        sessionId,
        cleanPlate,
        vehicleTypeId,
        boxId,
        user.userId,
        typeof notes === "string" && notes.length > 0 ? notes : null,
        keyLeft === true,
        cleanDamage.length > 0 ? cleanDamage : null,
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
        const current = races[0]!;
        return vehicleParkedResponse(
          cleanPlate,
          current,
          boxId,
          current.branch_id === branchId,
        );
      }
      const takenBoxRows = await query<{ number: string }>(
        `SELECT number FROM parking_boxes WHERE id = $1 AND branch_id = $2`,
        [boxId, branchId],
      );
      const number = takenBoxRows[0]?.number;
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

    // Regla S1: no se registra un ingreso sin turno de caja abierto.
    if (message.includes("No hay turno de caja abierto")) {
      return NextResponse.json(
        {
          code: "NO_OPEN_SHIFT",
          error: "Abrí un turno de caja antes de registrar un ingreso.",
        },
        { status: 409 },
      );
    }

    return rpcErrorResponse(err);
  }
}
