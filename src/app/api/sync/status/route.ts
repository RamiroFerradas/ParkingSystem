import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

/** Estado de la cola de sincronización (outbox). Solo admin. */

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "sync.manage"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }
  try {
    const [byStatus, recentRuns, recentErrors] = await Promise.all([
      query<{ status: string; count: string }>(
        `SELECT status::text AS status, count(*)::text AS count
           FROM sync_outbox GROUP BY status`,
      ),
      query<{
        id: string;
        direction: string;
        started_at: string;
        finished_at: string | null;
        ops_pushed: number;
        ops_pulled: number;
        errors: number;
        trigger: string;
      }>(
        `SELECT id::text, direction, started_at::text, finished_at::text,
                ops_pushed, ops_pulled, errors, trigger
           FROM sync_runs ORDER BY started_at DESC LIMIT 10`,
      ),
      query<{
        operation_id: string;
        entity_type: string;
        op: string;
        attempts: number;
        last_error: string | null;
        created_at: string;
      }>(
        `SELECT operation_id::text, entity_type, op::text AS op, attempts, last_error, created_at::text
           FROM sync_outbox WHERE status = 'error'
          ORDER BY created_at DESC LIMIT 20`,
      ),
    ]);
    return NextResponse.json({ byStatus, recentRuns, recentErrors });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
