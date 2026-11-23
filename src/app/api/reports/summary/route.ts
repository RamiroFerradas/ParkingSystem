import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { parseQuery, reportSummaryQuerySchema } from "@/lib/schemas/misc";

/** Reportes de recaudación. Requiere reports.read (supervisor+). */

interface DailyRow {
  day: string;
  sessions: string;
  collected: string;
}

interface MethodRow {
  method_name: string;
  sessions: string;
  collected: string;
}

/**
 * Totales del período. Solo las columnas que selecciona la SQL: no existe
 * `annulled` (ninguna consulta lo devuelve ni ningún consumidor lo lee).
 */
export interface SummaryTotals {
  sessions: string;
  collected: string;
}

export async function GET(request: Request) {
  const { context, error } = await getBranchContextOrFail("reports.read");
  if (error) return NextResponse.json(error.body, { status: error.status });

  const { days } = parseQuery(request, reportSummaryQuerySchema, { days: 30 });

  try {
    const [daily, byMethod, totals] = await Promise.all([
      query<DailyRow>(
        `SELECT date_trunc('day', p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date::text AS day,
                count(*)::text AS sessions,
                coalesce(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.paid_at >= now() - ($1::text || ' days')::interval
            AND p.branch_id = $2::uuid
          GROUP BY day ORDER BY day DESC`,
        [String(days), context.branchId],
      ),
      query<MethodRow>(
        `SELECT m.name AS method_name,
                count(*)::text AS sessions,
                coalesce(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN payment_methods m ON m.id = p.method_id
          WHERE p.paid_at >= now() - ($1::text || ' days')::interval
            AND p.branch_id = $2::uuid
          GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
        [String(days), context.branchId],
      ),
      query<SummaryTotals>(
        `SELECT count(*)::text AS sessions,
                coalesce(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.paid_at >= now() - ($1::text || ' days')::interval
            AND p.branch_id = $2::uuid`,
        [String(days), context.branchId],
      ),
    ]);
    return NextResponse.json({ days, daily, byMethod, totals: totals[0] ?? { sessions: "0", collected: "0" } });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
