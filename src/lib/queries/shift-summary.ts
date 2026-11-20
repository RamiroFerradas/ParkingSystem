import { query } from "@/lib/db/client";
import { formatARS, formatTime } from "@/lib/format";
import type { OpenShiftSummary } from "@/lib/shifts/types";

interface ShiftRow {
  id: string;
  opened_at_ms: string;
  opened_by: string;
  opened_by_name: string;
  collected: string;
  open_sessions: string;
}

/**
 * Estado del turno abierto de la sucursal activa para el sidebar.
 * Una sola consulta: es parte del render de cada página.
 */
export async function loadOpenShiftSummary(
  branchId: string,
  viewer: { userId: string; role: string | null },
): Promise<OpenShiftSummary | null> {
  const rows = await query<ShiftRow>(
    `SELECT cs.id,
            (floor(extract(epoch FROM cs.opened_at)) * 1000)::bigint::text AS opened_at_ms,
            cs.opened_by,
            p.email AS opened_by_name,
            (SELECT COALESCE(SUM(amount_charged_cents), 0)
               FROM payments WHERE shift_id = cs.id)::text AS collected,
            (SELECT count(*) FROM parking_sessions
              WHERE shift_id = cs.id AND status = 'open')::text AS open_sessions
       FROM cash_shifts cs
       JOIN profiles p ON p.id = cs.opened_by
      WHERE cs.status = 'open' AND cs.branch_id = $1
      LIMIT 1`,
    [branchId],
  );
  const row = rows[0];
  if (!row) return null;

  const openedAtMs = Number(row.opened_at_ms);
  const canCloseAny = viewer.role === "admin" || viewer.role === "supervisor";

  return {
    id: row.id,
    openedAtMs,
    elapsedMinutes: Math.max(0, Math.floor((Date.now() - openedAtMs) / 60_000)),
    openedAtLabel: formatTime(new Date(openedAtMs)),
    openedByName: row.opened_by_name,
    collectedLabel: formatARS(row.collected),
    openSessions: Number(row.open_sessions),
    canClose: canCloseAny || row.opened_by === viewer.userId,
  };
}
