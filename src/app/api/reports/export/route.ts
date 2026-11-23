import { query } from "@/lib/db/client";
import { rpcErrorResponse } from "@/lib/api/guard";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { parseQuery, reportExportQuerySchema } from "@/lib/schemas/misc";

/** CSV de recaudación diaria del período, para planillas. */

const TZ = "America/Argentina/Cordoba";

const PERIODS: { key: string; where: (col: string) => string }[] = [
  { key: "hoy", where: (c) => `${c} = (now() AT TIME ZONE '${TZ}')::date` },
  { key: "7", where: (c) => `${c} >= (now() - interval '7 days')` },
  { key: "30", where: (c) => `${c} >= (now() - interval '30 days')` },
  { key: "90", where: (c) => `${c} >= (now() - interval '90 days')` },
  { key: "mes", where: (c) => `date_trunc('month', ${c}) = date_trunc('month', now() AT TIME ZONE '${TZ}')` },
  { key: "anio", where: (c) => `date_trunc('year', ${c}) = date_trunc('year', now() AT TIME ZONE '${TZ}')` },
];

export async function GET(request: Request) {
  const { context, error } = await getBranchContextOrFail("reports.read");
  if (error) return new Response(error.body.error, { status: error.status });

  const { p } = parseQuery(request, reportExportQuerySchema, {});
  const period = PERIODS.find((candidate) => candidate.key === p) ?? PERIODS[2]!;

  try {
    const rows = await query<{ day: string; sessions: string; collected: string; methods: string }>(
      `WITH d AS (
         SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date AS day,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.paid_at >= now() - interval '1 year'
            AND p.branch_id = $1::uuid
          GROUP BY day
       ),
       m AS (
         SELECT x.day, string_agg(x.label, ' | ' ORDER BY x.label) AS methods FROM (
           SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date AS day,
                  m.name || ':' || sum(p.amount_charged_cents)::text AS label
             FROM payments p
             JOIN payment_methods m ON m.id = p.method_id
            WHERE p.paid_at >= now() - interval '1 year'
              AND p.branch_id = $1::uuid
            GROUP BY day, m.name
         ) x
        GROUP BY x.day
       )
       SELECT d.day::text, d.sessions, d.collected, COALESCE(m.methods, '') AS methods
         FROM d LEFT JOIN m ON m.day = d.day
        WHERE ${period.where("d.day")}
        ORDER BY d.day DESC`,
      [context.branchId],
    );
    const header = "dia,cobros,recaudado_cents,por_medio\n";
    const body = rows
      .map((r) => `${r.day},${r.sessions},${r.collected},"${r.methods.replace(/"/g, "'")}"`)
      .join("\n");
    return new Response(header + body + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reporte-${period.key}.csv"`,
      },
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
