import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatDate, formatTime } from "@/lib/format";

export default async function SincronizacionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user.role, "sync.manage"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Solo el administrador puede ver el estado de sincronización.
          </p>
        </div>
      </div>
    );
  }

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

  const countOf = (s: string) => Number(byStatus.find((r) => r.status === s)?.count ?? 0);
  const pending = countOf("pending") + countOf("in_process");

  const cards = [
    { label: "Pendientes de envío", value: pending, tone: pending > 0 ? "text-amber-400" : "text-neutral-100" },
    { label: "Sincronizadas", value: countOf("synced"), tone: "text-neutral-100" },
    { label: "Con error", value: countOf("error"), tone: countOf("error") > 0 ? "text-red-400" : "text-neutral-100" },
    { label: "A resolver", value: countOf("needs_resolution"), tone: countOf("needs_resolution") > 0 ? "text-red-400" : "text-neutral-100" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Sincronización</h1>
        <p className="text-sm text-neutral-500">
          Cola de operaciones hacia la nube (outbox) y últimas corridas.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </section>

      {recentErrors.length > 0 && (
        <section className="rounded-xl border border-neutral-800">
          <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            Operaciones con error
          </h2>
          <ul className="divide-y divide-neutral-800 bg-neutral-950 text-sm">
            {recentErrors.map((e) => (
              <li key={e.operation_id} className="px-4 py-2.5">
                <p className="text-neutral-300">
                  <span className="font-mono text-xs text-neutral-500">{e.op}</span>{" "}
                  {e.entity_type} · intentos: {e.attempts}
                </p>
                {e.last_error && (
                  <p className="mt-0.5 text-xs text-red-400">{e.last_error}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <h2 className="bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
          Últimas corridas
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Inicio</th>
              <th className="px-4 py-2 font-medium">Dirección</th>
              <th className="px-4 py-2 text-right font-medium">Enviadas</th>
              <th className="px-4 py-2 text-right font-medium">Recibidas</th>
              <th className="px-4 py-2 text-right font-medium">Errores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {recentRuns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-neutral-500">
                  Sin corridas registradas.
                </td>
              </tr>
            )}
            {recentRuns.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 text-neutral-400">
                  {formatDate(r.started_at)} {formatTime(r.started_at)}
                </td>
                <td className="px-4 py-2.5 text-neutral-300">{r.direction}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">{r.ops_pushed}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">{r.ops_pulled}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${r.errors > 0 ? "text-red-400" : "text-neutral-400"}`}>
                  {r.errors}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
