import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import {
  createPrintJobSchema,
  updatePrintJobSchema,
  type CreatePrintJobPayload,
  type UpdatePrintJobPayload,
} from "@/lib/schemas/operations";

/**
 * Cola de impresión térmica (print_jobs).
 * El reintento marca SIEMPRE el mismo job (nunca duplica registro, F2);
 * una reimpresión manual desde historial crea un job nuevo y auditado.
 */

interface JobRow {
  id: string;
  session_id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  ticket_number: string;
  plate: string | null;
}

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const allowed = ["pending", "printed", "error"];
  if (status && !allowed.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  try {
    const rows = await query<JobRow>(
      `SELECT j.id::text, j.session_id::text, j.kind::text AS kind, j.status::text AS status,
              j.attempts, j.last_error, j.created_at::text,
              s.ticket_number::text, v.plate
         FROM print_jobs j
         JOIN parking_sessions s ON s.id = j.session_id
         JOIN vehicles v ON v.id = s.vehicle_id
        WHERE ($1::print_job_status IS NULL OR j.status = $1::print_job_status)
        ORDER BY j.created_at DESC
        LIMIT 50`,
      [status],
    );
    return NextResponse.json({ jobs: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { data: body, error: bodyError } = await parseBody<CreatePrintJobPayload>(
    request,
    createPrintJobSchema,
    "Datos de impresión inválidos",
  );
  if (bodyError) return bodyError;

  const { sessionId, kind } = body;

  try {
    // B1: la sucursal se resuelve desde la estadía, no desde el body. Un job
    // solo puede encolarse para una estadía de la sucursal activa.
    const owned = await query<{ id: string }>(
      "SELECT id FROM parking_sessions WHERE id = $1 AND branch_id = $2",
      [sessionId, user.branchId],
    );
    if (!owned[0]) {
      return NextResponse.json({ error: "Estadía no encontrada" }, { status: 404 });
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO print_jobs (id, session_id, kind) VALUES (gen_random_uuid(), $1, $2::print_job_kind)
       RETURNING id::text`,
      [sessionId, kind],
    );
    if (kind === "reprint") {
      await query(
        `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
         VALUES (gen_random_uuid(), $1, 'ticket.reprint', 'parking_session', $2)`,
        [user.userId, sessionId],
      );
    }
    return NextResponse.json({ ok: true, id: rows[0]!.id }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23503") {
      return NextResponse.json({ error: "La estadía indicada no existe" }, { status: 400 });
    }
    return rpcErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { data: body, error: bodyError } = await parseBody<UpdatePrintJobPayload>(
    request,
    updatePrintJobSchema,
    "Estado de impresión inválido",
  );
  if (bodyError) return bodyError;

  const { id, status, lastError } = body;

  try {
    const rows = await query<{ id: string }>(
      `UPDATE print_jobs j SET
          status = $2::print_job_status,
          attempts = attempts + 1,
          last_error = CASE WHEN $2::print_job_status = 'error' THEN $3::text ELSE NULL END,
          printed_at = CASE WHEN $2::print_job_status = 'printed' THEN now() ELSE printed_at END
        WHERE j.id = $1
          AND EXISTS (
            SELECT 1 FROM parking_sessions s
             WHERE s.id = j.session_id AND s.branch_id = $4
          )
        RETURNING j.id::text`,
      [id, status, typeof lastError === "string" ? lastError.slice(0, 300) : null, user.branchId],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Job de impresión inexistente" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
