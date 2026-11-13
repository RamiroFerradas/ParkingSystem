import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatARS, formatDate } from "@/lib/format";

export default async function ReportesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user.role, "reports.read"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Requiere permiso de reportes (supervisor o administrador).
          </p>
        </div>
      </div>
    );
  }

  const days = 30;
  const [daily, byMethod, totals] = await Promise.all([
    query<{ day: string; sessions: string; collected: string }>(
      `SELECT date_trunc('day', p.paid_at AT TIME ZONE 'America/Argentina/Cordoba')::date::text AS day,
              count(*)::text AS sessions,
              coalesce(sum(p.amount_charged_cents), 0)::text AS collected
         FROM payments p
        WHERE p.paid_at >= now() - ($1::text || ' days')::interval
        GROUP BY day ORDER BY day DESC`,
      [String(days)],
    ),
    query<{ method_name: string; sessions: string; collected: string }>(
      `SELECT m.name AS method_name,
              count(*)::text AS sessions,
              coalesce(sum(p.amount_charged_cents), 0)::text AS collected
         FROM payments p
         JOIN payment_methods m ON m.id = p.method_id
        WHERE p.paid_at >= now() - ($1::text || ' days')::interval
        GROUP BY m.name ORDER BY sum(p.amount_charged_cents) DESC`,
      [String(days)],
    ),
    query<{ sessions: string; collected: string }>(
      `SELECT count(*)::text AS sessions,
              coalesce(sum(p.amount_charged_cents), 0)::text AS collected
         FROM payments p
        WHERE p.paid_at >= now() - ($1::text || ' days')::interval`,
      [String(days)],
    ),
  ]);

  const total = totals[0] ?? { sessions: "0", collected: "0" };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-neutral-500">Últimos {days} días · cobros cerrados.</p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Recaudación total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
            {formatARS(total.collected)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Cobros registrados</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">{total.sessions}</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
          Recaudación por medio de pago
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Medio</th>
              <th className="px-4 py-2 text-right font-medium">Cobros</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {byMethod.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-neutral-500">
                  Sin cobros en el período.
                </td>
              </tr>
            )}
            {byMethod.map((m) => (
              <tr key={m.method_name}>
                <td className="px-4 py-2.5 text-neutral-200">{m.method_name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{m.sessions}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-neutral-100">
                  {formatARS(m.collected)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
          Ingresos por día
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Día</th>
              <th className="px-4 py-2 text-right font-medium">Cobros</th>
              <th className="px-4 py-2 text-right font-medium">Recaudado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {daily.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-neutral-500">
                  Sin cobros en el período.
                </td>
              </tr>
            )}
            {daily.map((d) => (
              <tr key={d.day}>
                <td className="px-4 py-2.5 text-neutral-300">{formatDate(d.day)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{d.sessions}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-neutral-100">
                  {formatARS(d.collected)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
