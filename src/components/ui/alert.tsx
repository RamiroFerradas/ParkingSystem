import type { ReactNode } from "react";
import { cx } from "@/lib/ui-classes";

export type AlertTone = "error" | "error-soft" | "info" | "warning";

/**
 * Full class strings per tone. `error` comes from the eight managers
 * (border-red-800 bg-red-950/50 text-red-300); `error-soft` is the role="alert"
 * block used by the forms; `warning` is the amber notice used by the shift and
 * report screens. `info` reuses the sky accent the app already uses for
 * "Programada" state; no existing alert block uses it yet.
 */
const TONE: Record<AlertTone, string> = {
  error: "rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300",
  "error-soft": "rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400",
  warning: "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200",
  info: "rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-300",
};

export interface AlertProps {
  tone?: AlertTone;
  className?: string;
  children: ReactNode;
}

export function Alert({ tone = "error", className, children }: AlertProps) {
  return <p className={cx(TONE[tone], className)}>{children}</p>;
}
