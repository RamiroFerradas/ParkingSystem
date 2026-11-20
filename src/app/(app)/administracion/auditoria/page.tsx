import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatDate, formatTime } from "@/lib/format";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityType?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "audit.read"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Solo el administrador puede consultar la auditoría.
          </p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const action = params.action?.trim() || null;
  const entityType = params.entityType?.trim() || null;

  const logs = await query<{
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
      ORDER BY a.occurred_at DESC
      LIMIT 200`,
    [action, entityType],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-sm text-neutral-500">
          Registro append-only de acciones del sistema (últimos 200 eventos).
        </p>
      </header>

      <form className="flex flex-wrap items-center gap-2" action="/administracion/auditoria">
        <input
          name="action"
          defaultValue={action ?? ""}
          placeholder="Filtrar por acción (ej. tariff.)"
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
        />
        <input
          name="entityType"
          defaultValue={entityType ?? ""}
          placeholder="Entidad (ej. parking_tariff)"
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
        />
        <button className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
          Filtrar
        </button>
      </form>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Acción</th>
              <th className="px-4 py-2 font-medium">Entidad</th>
              <th className="px-4 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-neutral-500">
                  Sin eventos que coincidan.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 whitespace-nowrap text-neutral-400">
                  {formatDate(l.occurred_at)} {formatTime(l.occurred_at)}
                </td>
                <td className="px-4 py-2.5 text-neutral-300">{l.actor_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-200">{l.action}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-neutral-500">
                  {l.entity_type}
                  {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ""}
                </td>
                <td className="max-w-xs px-4 py-2.5">
                  {Boolean(l.before ?? l.after) && (
                    <code className="block truncate text-xs text-neutral-500">
                      {JSON.stringify(l.before ?? l.after)}
                    </code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
