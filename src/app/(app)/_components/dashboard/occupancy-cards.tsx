import { getBranchContext } from "@/lib/auth/context";
import { loadBoxOccupancy, type BoxOccupancy } from "@/lib/queries/dashboard";
import { MetricCard } from "./metric-card";

export interface OccupancyCardsProps {
  data: BoxOccupancy;
}

/**
 * Estado de la cochera: es el dato que el dueño mira desde el teléfono. Va
 * como tarjeta ancha con la ocupación grande y la barra, no como tres números
 * sueltos que en 360px no se leen.
 */
export function OccupancyCards({ data }: OccupancyCardsProps) {
  const { occupied, available, total, pct } = data;
  return (
    <>
      <div className="col-span-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-neutral-500">Ocupación ahora</p>
            <p
              className={
                "mt-1 text-4xl font-semibold tabular-nums sm:text-5xl " +
                (pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-emerald-400")
              }
            >
              {pct}%
            </p>
          </div>
          <p className="text-right text-xs text-neutral-500">
            <span className="block text-sm font-medium tabular-nums text-neutral-300">
              {occupied} / {total}
            </span>
            boxes ocupados
            {total === 0 ? " · sin boxes cargados" : ""}
          </p>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-800"
          role="img"
          aria-label={`${pct}% de ocupación: ${occupied} de ${total} boxes ocupados`}
        >
          <div
            className={
              "h-full rounded-full " +
              (pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500")
            }
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <MetricCard label="Ocupados" value={String(occupied)} tone="red" />
      <MetricCard label="Disponibles" value={String(available)} tone="green" />
    </>
  );
}

export async function OccupancyCardsSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const data = await loadBoxOccupancy(context.branchId);
  return <OccupancyCards data={data} />;
}
