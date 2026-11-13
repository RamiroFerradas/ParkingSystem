import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

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
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user.role, "reports.read"))) {
    return new Response("No tenés permiso", { status: 403 });
  }

  const url = new URL(request.url);
  const period = PERIODS.find((p) => p.key === url.searchParams.get("p")) ?? PERIODS[2]!;

  try {
    const rows = await query<{ day: string; sessions: string; collected: string; methods: string }>(
      `WITH d AS (
         SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date AS day,
                count(*)::text AS sessions,
                COALESCE(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.paid_at >= now() - interval '1 year'
          GROUP BY day
       ),
       m AS (
         SELECT x.day, string_agg(x.label, ' | ' ORDER BY x.label) AS methods FROM (
           SELECT date_trunc('day', p.paid_at AT TIME ZONE '${TZ}')::date AS day,
                  m.name || ':' || sum(p.amount_charged_cents)::text AS label
             FROM payments p
             JOIN payment_methods m ON m.id = p.method_id
            WHERE p.paid_at >= now() - interval '1 year'
            GROUP BY day, m.name
         ) x
        GROUP BY x.day
       )
       SELECT d.day::text, d.sessions, d.collected, COALESCE(m.methods, '') AS methods
         FROM d LEFT JOIN m ON m.day = d.day
        WHERE ${period.where("d.day")}
        ORDER BY d.day DESC`,
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
