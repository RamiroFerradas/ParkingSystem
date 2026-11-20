import { loadFilterOptions, loadHistorial, parseHistorialFilters } from "@/lib/queries/historial";
import type { HistorialFilters, HistorialOptions } from "@/lib/queries/historial";
import { historialScopeForSession } from "@/lib/auth/scope";
import { HistorialTable, type HistorialRow } from "./HistorialTable";

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseHistorialFilters(sp);
  const scope: { ownerId?: string } = (await historialScopeForSession()) ?? {};
  const [options, rows] = await Promise.all([
    loadFilterOptions(),
    loadHistorial(filters, 500, scope),
  ]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Historial de estadías</h1>
        <p className="text-sm text-neutral-500">
          {scope.ownerId
            ? "Tus estadías (las que registraste), abiertas y cerradas, con filtros por URL"
            : "Todas las estadías, abiertas y cerradas, con filtros por URL (compartibles)"}
        </p>
      </header>

      <FilterForm options={options} filters={filters} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          {rows.length} estadía{rows.length === 1 ? "" : "s"} (máximo 500, más recientes primero)
        </p>
        <a
          href={`/api/sessions/export?${new URLSearchParams(
            Object.entries(filters).map(([k, v]) => [k, String(v)]),
          ).toString()}`}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
        >
          Exportar CSV
        </a>
      </div>

      <HistorialTable rows={rows as HistorialRow[]} />
    </div>
  );
}

function FilterForm({
  options,
  filters,
}: {
  options: HistorialOptions;
  filters: HistorialFilters;
}) {
  const selectCls =
    "min-h-10 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100";
  const inputCls =
    "min-h-10 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100";
  const labelCls = "flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-neutral-500";

  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <label className={labelCls}>
        Fecha desde
        <input className={inputCls} type="date" name="from" defaultValue={filters.from} />
      </label>
      <label className={labelCls}>
        Fecha hasta
        <input className={inputCls} type="date" name="to" defaultValue={filters.to} />
      </label>
      <label className={labelCls}>
        Patente
        <input
          className={inputCls + " w-28"}
          name="plate"
          placeholder="ABC123"
          defaultValue={filters.plate}
          maxLength={10}
        />
      </label>
      <label className={labelCls}>
        Tipo
        <select className={selectCls} name="typeId" defaultValue={filters.typeId ?? ""}>
          <option value="">Todos</option>
          {options.types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Box
        <select className={selectCls} name="boxId" defaultValue={filters.boxId ?? ""}>
          <option value="">Todos</option>
          {options.boxes.map((b) => (
            <option key={b.id} value={b.id}>{b.number}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Empleado (cerró)
        <select className={selectCls} name="employeeId" defaultValue={filters.employeeId ?? ""}>
          <option value="">Todos</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Medio de pago
        <select className={selectCls} name="methodId" defaultValue={filters.methodId ?? ""}>
          <option value="">Todos</option>
          {options.methods.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Estado
        <select className={selectCls} name="status" defaultValue={filters.status ?? ""}>
          <option value="">Todos</option>
          <option value="open">Abiertas</option>
          <option value="closed">Cerradas</option>
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
      >
        Filtrar
      </button>
      <a
        href="/operaciones/historial"
        className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
      >
        Limpiar
      </a>
    </form>
  );
}
