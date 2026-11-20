export type MetricTone = "red" | "green" | "neutral";

const TONE: Record<MetricTone, string> = {
  red: "text-red-400",
  green: "text-emerald-400",
  neutral: "text-neutral-100",
};

export interface MetricCardProps {
  label: string;
  value: string;
  tone: MetricTone;
  className?: string;
}

/**
 * Tarjeta de métrica del dashboard.
 *
 * No usa `@/components/ui/stat-card` a propósito: esta sección necesita el
 * tono `red`, el padding `p-4 sm:p-5` y el valor `text-xl sm:text-2xl`, y el
 * primitivo no expone ninguna de las tres cosas. Reemplazarlo cambiaría el
 * HTML renderizado.
 */
export function MetricCard({ label, value, tone, className = "" }: MetricCardProps) {
  return (
    <div
      className={
        "min-w-0 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5 " + className
      }
    >
      <p className="text-[11px] font-medium text-neutral-500 sm:text-xs">{label}</p>
      <p
        className={
          "mt-1.5 break-words text-xl font-semibold tabular-nums sm:mt-2 sm:text-2xl " + TONE[tone]
        }
      >
        {value}
      </p>
    </div>
  );
}
