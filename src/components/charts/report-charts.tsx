import { formatARS } from "@/lib/format";

/**
 * Gráficos de reportes sin dependencias: HTML/CSS puro (columnas y barras).
 * Son componentes de servidor; no llevan estado ni interactividad.
 */

export interface StackedMonthPoint {
  /** Clave `YYYY-MM`, usada como key estable. */
  month: string;
  /** Etiqueta corta debajo de la barra (p. ej. "nov 25"). */
  label: string;
  sessionsCents: number;
  abonoCents: number;
  entries: number;
}

const BAR_AREA_PX = 144;

/** Formato compacto para el eje: $12,5 mil / $1,2 M. */
function compactARS(cents: number): string {
  const value = cents / 100;
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-AR", {
      maximumFractionDigits: 1,
    })} M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000).toLocaleString("es-AR")} mil`;
  }
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

export function StackedMonthBars({
  data,
  emptyLabel = "Sin cobros en el período.",
}: {
  data: StackedMonthPoint[];
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.sessionsCents + d.abonoCents));
  const totalSessions = data.reduce((sum, d) => sum + d.sessionsCents, 0);
  const totalAbonos = data.reduce((sum, d) => sum + d.abonoCents, 0);
  const showLegend = totalSessions > 0 && totalAbonos > 0;
  const summary = data
    .map((d) => `${d.label}: ${formatARS(d.sessionsCents + d.abonoCents)}`)
    .join("; ");

  if (data.every((d) => d.sessionsCents + d.abonoCents === 0)) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500">{emptyLabel}</p>
    );
  }

  return (
    <div>
      <div className="scroll-x">
        <div
          className="flex min-w-[380px] items-end gap-1 sm:min-w-0 sm:gap-2"
          role="img"
          aria-label={`Facturación por mes. ${summary}`}
        >
          {data.map((d) => {
            const total = d.sessionsCents + d.abonoCents;
            const heightPx =
              total === 0 ? 0 : Math.max(2, Math.round((total / max) * BAR_AREA_PX));
            const abonoPx =
              total === 0 ? 0 : Math.round((d.abonoCents / total) * heightPx);
            const sessionsPx = heightPx - abonoPx;
            return (
              <div
                key={d.month}
                className="flex min-w-0 flex-1 flex-col items-center justify-end"
                title={`${d.label}: ${formatARS(total)}${
                  d.entries > 0 ? ` · ${d.entries} cobros` : ""
                }`}
              >
                <span className="mb-1 hidden h-4 text-[10px] leading-none tabular-nums text-neutral-500 sm:block">
                  {total > 0 ? compactARS(total) : ""}
                </span>
                <div
                  className="flex w-full max-w-8 flex-col justify-end overflow-hidden rounded-t-sm bg-neutral-800/60"
                  style={{ height: `${heightPx}px` }}
                >
                  {abonoPx > 0 && (
                    <div
                      className="w-full bg-emerald-500/80"
                      style={{ height: `${abonoPx}px` }}
                    />
                  )}
                  {sessionsPx > 0 && (
                    <div
                      className="w-full bg-amber-500/80"
                      style={{ height: `${sessionsPx}px` }}
                    />
                  )}
                </div>
                <span className="mt-1 text-[10px] leading-none whitespace-nowrap text-neutral-500">
                  <span className="sm:hidden">{d.label.slice(0, 3)}</span>
                  <span className="hidden sm:inline">{d.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-500/80" aria-hidden />
            Estadías
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500/80" aria-hidden />
            Abonos
          </span>
        </div>
      )}
    </div>
  );
}

export interface HBarItem {
  label: string;
  value: number;
  detail?: string;
}

export function HBarList({
  items,
  unit,
  unitSingular,
}: {
  items: HBarItem[];
  unit: string;
  unitSingular?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-500">Sin datos en el período.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const width = Math.max(2, Math.round((item.value / max) * 100));
        return (
          <li key={`${item.label}-${index}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-mono text-neutral-200">{item.label}</span>
              <span className="shrink-0 tabular-nums text-neutral-400">
                {item.value.toLocaleString("es-AR")}{" "}
                {item.value === 1 && unitSingular ? unitSingular : unit}
                {item.detail && (
                  <span className="ml-2 text-neutral-500">{item.detail}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-amber-500/70"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface DowPoint {
  /** 0 = domingo … 6 = sábado (EXTRACT(DOW)). */
  dow: number;
  count: number;
}

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

export function DowBars({ data }: { data: DowPoint[] }) {
  const counts = new Map(data.map((d) => [d.dow, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div
      className="flex items-end gap-2 sm:gap-3"
      role="img"
      aria-label={`Ingresos por día de la semana, total ${total}. ${DOW_ORDER.map(
        (dow) => `${DOW_LABELS[dow]}: ${counts.get(dow) ?? 0}`,
      ).join("; ")}`}
    >
      {DOW_ORDER.map((dow) => {
        const count = counts.get(dow) ?? 0;
        const heightPx =
          count === 0 ? 0 : Math.max(2, Math.round((count / max) * BAR_AREA_PX));
        return (
          <div
            key={dow}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            title={`${DOW_LABELS[dow]} — ${count} ingresos`}
          >
            <span className="mb-1 h-4 text-[10px] leading-none tabular-nums text-neutral-500">
              {count > 0 ? count : ""}
            </span>
            <div
              className="w-full max-w-10 rounded-t-sm bg-amber-500/70"
              style={{ height: `${heightPx}px` }}
            />
            <span className="mt-1 text-[10px] leading-none text-neutral-500">
              {DOW_LABELS[dow]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
