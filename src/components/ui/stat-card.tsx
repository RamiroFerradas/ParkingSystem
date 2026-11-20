import type { ReactNode } from "react";
import { cx } from "@/lib/ui-classes";

export type StatCardTone = "neutral" | "green" | "amber";
/**
 * `md` = turnos cards (rounded-lg, text-lg), `lg` = abonados/boxes cards
 * (rounded-xl, text-2xl), `responsive` = reportes home (p-3 sm:p-4 with
 * responsive label and value sizes).
 */
export type StatCardSize = "md" | "lg" | "responsive";

const SIZE: Record<StatCardSize, { box: string; label: string; value: string }> = {
  md: {
    box: "rounded-lg border border-neutral-800 bg-neutral-900 p-4",
    label: "text-xs text-neutral-500",
    value: "mt-1 text-lg font-semibold tabular-nums",
  },
  lg: {
    box: "rounded-xl border border-neutral-800 bg-neutral-900 p-4",
    label: "text-xs text-neutral-500",
    value: "mt-1 text-2xl font-semibold tabular-nums",
  },
  responsive: {
    box: "min-w-0 rounded-xl border border-neutral-800 bg-neutral-900 p-3 sm:p-4",
    label: "text-[11px] text-neutral-500 sm:text-xs",
    value: "mt-1 break-words text-lg font-semibold tabular-nums sm:text-2xl",
  },
};

const TONE: Record<StatCardTone, string> = {
  neutral: "text-neutral-100",
  green: "text-emerald-400",
  amber: "text-amber-400",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  tone?: StatCardTone;
  size?: StatCardSize;
  hint?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  tone = "neutral",
  size = "md",
  hint,
  className,
}: StatCardProps) {
  const styles = SIZE[size];
  return (
    <div className={cx(styles.box, className)}>
      <p className={styles.label}>{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p> : null}
      <p className={cx(styles.value, TONE[tone])}>{value}</p>
    </div>
  );
}
