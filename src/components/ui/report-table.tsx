import type { ReactNode } from "react";
import { cx } from "@/lib/ui-classes";

export { StatCard as Card } from "./stat-card";

/** Horizontal padding varies across the five report screens; keep each one. */
export type TablePadding = "default" | "wide" | "compact";

const TH_PADDING: Record<TablePadding, string> = {
  default: "px-3 sm:px-4",
  wide: "px-4",
  compact: "px-3",
};

const TD_PADDING: Record<TablePadding, string> = {
  default: "px-3 py-2.5 sm:px-4",
  wide: "px-4 py-2.5",
  compact: "px-3 py-2",
};

export interface TableSectionProps {
  title: ReactNode;
  children: ReactNode;
  /** `auto` = overflow-x-auto (abonados); `app` = the `scroll-x` utility (reportes home). */
  scroll?: "auto" | "app";
  /** Sticky heading used by the reportes home tables. */
  sticky?: boolean;
  /** Extra table classes, e.g. `min-w-[380px]`. */
  tableClassName?: string;
  className?: string;
}

export function TableSection({
  title,
  children,
  scroll = "auto",
  sticky = false,
  tableClassName,
  className,
}: TableSectionProps) {
  return (
    <section
      className={cx(
        scroll === "auto" ? "overflow-x-auto" : "scroll-x",
        "rounded-xl border border-neutral-800",
        className,
      )}
    >
      <h2
        className={cx(
          "bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300",
          sticky && "sticky left-0",
        )}
      >
        {title}
      </h2>
      <table className={cx("w-full text-sm", tableClassName)}>{children}</table>
    </section>
  );
}

export interface ThProps {
  children: ReactNode;
  right?: boolean;
  padding?: TablePadding;
  className?: string;
}

/**
 * No `text-left` by default: three of the five screens rely on the browser's
 * centered `th`, and the turnos screens pass `className="text-left"`.
 */
export function Th({ children, right, padding = "default", className }: ThProps) {
  return (
    <th className={cx(TH_PADDING[padding], "py-2 font-medium", right && "text-right", className)}>
      {children}
    </th>
  );
}

export interface TdProps {
  children: ReactNode;
  right?: boolean;
  strong?: boolean;
  mono?: boolean;
  padding?: TablePadding;
  /** `inherit` drops the text color, as turnos/[id] does. */
  tone?: "default" | "inherit";
  className?: string;
}

export function Td({
  children,
  right,
  strong,
  mono,
  padding = "default",
  tone = "default",
  className,
}: TdProps) {
  const color =
    tone === "inherit" ? undefined : strong ? "font-medium text-neutral-100" : "text-neutral-300";

  return (
    <td
      className={cx(
        TD_PADDING[padding],
        right && "text-right tabular-nums",
        color,
        strong && tone === "inherit" && "font-medium",
        mono && "font-mono text-xs",
        className,
      )}
    >
      {children}
    </td>
  );
}

export interface EmptyProps {
  cols: number;
  children?: ReactNode;
  className?: string;
}

export function Empty({ cols, children, className }: EmptyProps) {
  return (
    <tr>
      <td colSpan={cols} className={cx("px-4 py-4 text-center text-neutral-500", className)}>
        {children ?? "Sin datos en el período."}
      </td>
    </tr>
  );
}
