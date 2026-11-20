import { NextResponse } from "next/server";
import { pool } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";

interface SessionRow {
  id: string;
  ticket_number: string;
  box_id: string;
  box_number: string;
  plate: string;
  status: string;
}

interface BoxRow {
  id: string;
  number: string;
  is_active: boolean;
  is_service_enabled: boolean;
}

/** Error de validación con status HTTP, para abortar la transacción sin perder el mensaje. */
class MoveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Mueve una estadía abierta a otro box SIN cerrarla: conserva ticket, patente
 * y hora de ingreso (no se recobra ni se emite un ticket nuevo).
 */
export async function POST(request: Request) {
  const { context, error } = await getBranchContextOrFail("session.open");
  if (error) return NextResponse.json(error.body, { status: error.status });
  const user = context.user;
  const branchId = context.branchId;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { sessionId, boxId } = body;
  if (typeof sessionId !== "string" || typeof boxId !== "string") {
    return NextResponse.json(
      { error: "Faltan datos del movimiento" },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sessionRes = await client.query<SessionRow>(
      `SELECT s.id, s.ticket_number::text, s.box_id, b.number AS box_number,
              v.plate, s.status
         FROM parking_sessions s
         JOIN vehicles v      ON v.id = s.vehicle_id
         JOIN parking_boxes b ON b.id = s.box_id
        WHERE s.id = $1 AND s.branch_id = $2
        FOR UPDATE OF s`,
      [sessionId, branchId],
    );
    const session = sessionRes.rows[0];
    if (!session) {
      throw new MoveError(404, "Estadía no encontrada");
    }
    if (session.status !== "open") {
      throw new MoveError(409, "La estadía ya está cerrada");
    }

    const boxRes = await client.query<BoxRow>(
      `SELECT id, number, is_active, is_service_enabled
         FROM parking_boxes
        WHERE id = $1 AND branch_id = $2`,
      [boxId, branchId],
    );
    const box = boxRes.rows[0];
    if (!box) {
      throw new MoveError(404, "Box inexistente");
    }
    if (!box.is_active) {
      throw new MoveError(409, `El box ${box.number} está dado de baja`);
    }
    if (!box.is_service_enabled) {
      throw new MoveError(409, `El box ${box.number} está fuera de servicio`);
    }
    if (box.id === session.box_id) {
      throw new MoveError(
        409,
        `La patente ${session.plate} ya está en el box ${box.number}`,
      );
    }

    const busy = await client.query(
      `SELECT 1 FROM parking_sessions
        WHERE box_id = $1 AND status = 'open' AND id <> $2
        LIMIT 1`,
      [boxId, sessionId],
    );
    if ((busy.rowCount ?? 0) > 0) {
      throw new MoveError(409, `El box ${box.number} ya está ocupado`);
    }

    await client.query(`UPDATE parking_sessions SET box_id = $1 WHERE id = $2`, [
      boxId,
      sessionId,
    ]);

    // D6: el movimiento queda encolado en la misma transacción.
    await client.query(
      `INSERT INTO sync_outbox (operation_id, entity_type, entity_id, op, payload, device_id)
       VALUES (gen_random_uuid(), 'parking_session', $1, 'update',
               (SELECT to_jsonb(s) FROM parking_sessions s WHERE s.id = $2::uuid) ||
               jsonb_build_object('box_id', $3::uuid),
               NULL)`,
      [sessionId, sessionId, boxId],
    );

    await client.query(
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, before, after)
       VALUES (gen_random_uuid(), $1, $7, 'session.move', 'parking_session', $2,
               jsonb_build_object('box_id', $3::uuid, 'box_number', $4::text),
               jsonb_build_object('box_id', $5::uuid, 'box_number', $6::text))`,
      [
        user.userId,
        sessionId,
        session.box_id,
        session.box_number,
        box.id,
        box.number,
        branchId,
      ],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      sessionId,
      ticketNumber: Number(session.ticket_number),
      boxId: box.id,
      boxNumber: box.number,
      plate: session.plate,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof MoveError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return rpcErrorResponse(err);
  } finally {
    client.release();
  }
}
