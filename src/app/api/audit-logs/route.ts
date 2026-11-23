import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { auditLogsQuerySchema, parseQuery } from "@/lib/schemas/misc";

/** Consulta del registro de auditoría (append-only). Solo admin. */

export async function GET(request: Request) {
  const { context, error } = await getBranchContextOrFail("audit.read");
  if (error) return NextResponse.json(error.body, { status: error.status });

  const { action, entityType, limit } = parseQuery(request, auditLogsQuerySchema, {
    action: null,
    entityType: null,
    limit: 100,
  });

  try {
    const rows = await query<{
      id: string;
      occurred_at: string;
      actor_name: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      before: unknown;
      after: unknown;
    }>(
      `SELECT a.id::text, a.occurred_at::text, pr.email AS actor_name, a.action,
              a.entity_type, a.entity_id, a.before, a.after
         FROM audit_logs a
         LEFT JOIN profiles pr ON pr.id = a.actor_id
        WHERE ($1::text IS NULL OR a.action ILIKE '%' || $1::text || '%')
          AND ($2::text IS NULL OR a.entity_type = $2::text)
          AND (a.branch_id = $4::uuid OR a.branch_id IS NULL)
        ORDER BY a.occurred_at DESC
        LIMIT $3`,
      [action, entityType, limit, context.branchId],
    );
    return NextResponse.json({ logs: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
