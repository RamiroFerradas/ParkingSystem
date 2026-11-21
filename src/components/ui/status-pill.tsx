import type { ReactNode } from "react";
import { badgeCls, cx } from "@/lib/ui-classes";

export type StatusPillTone = "green" | "amber" | "red" | "neutral";

/**
 * Tone strings come from the existing status badges: green/amber/neutral from
 * the abonos and tariffs validity badges, red from the out-of-service chip in
 * the box map (`border-red-500/30 bg-red-500/10 text-red-300`).
 */
const TONE: Record<StatusPillTone, string> = {
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  red: "border-red-500/30 bg-red-500/10 text-red-300",
  neutral: "border-neutral-700 text-neutral-400",
};

export interface StatusPillProps {
  tone?: StatusPillTone;
  className?: string;
  children: ReactNode;
}

export function StatusPill({ tone = "neutral", className, children }: StatusPillProps) {
  return <span className={cx(badgeCls, TONE[tone], className)}>{children}</span>;
}
