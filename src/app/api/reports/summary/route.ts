import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";

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

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "reports.read"))) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 365);

  try {
    const [daily, byMethod, totals] = await Promise.all([
      query<DailyRow>(
        `SELECT date_trunc('day', p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date::text AS day,
                count(*)::text AS sessions,
                coalesce(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.paid_at >= now() - ($1::text || ' days')::interval
          GROUP BY day ORDER BY day DESC`,
        [String(days)],
      ),
      query<MethodRow>(
        `SELECT m.name AS method_name,
                count(*)::text AS sessions,
                coalesce(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
           JOIN payment_methods m ON m.id = p.method_id
          WHERE p.paid_at >= now() - ($1::text || ' days')::interval
          GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
        [String(days)],
      ),
      query<{ sessions: string; collected: string; annulled: string }>(
        `SELECT count(*)::text AS sessions,
                coalesce(sum(p.amount_charged_cents), 0)::text AS collected
           FROM payments p
          WHERE p.paid_at >= now() - ($1::text || ' days')::interval`,
        [String(days)],
      ),
    ]);
    return NextResponse.json({ days, daily, byMethod, totals: totals[0] ?? { sessions: "0", collected: "0" } });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
