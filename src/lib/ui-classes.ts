/**
 * Shared Tailwind strings for the UI primitives in `src/components/ui`.
 *
 * Each constant is copied verbatim from the call site that uses it most, so a
 * primitive can replace a local copy without changing the rendered pixels.
 * Divergent variants are kept as their own exports (never normalized away).
 * The repo carries neither `clsx` nor `tailwind-merge`, so `cx` is a plain
 * join; callers that pass a conflicting utility win only by CSS order, which
 * is why the primitives keep the canonical variant and merge only additions.
 */

/** Canonical form input: methods, tariffs, users, types, specials, abonos, auditoría. */
export const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";

/** Full-width input with wider padding: vehicles filter (vehicles-list.tsx). */
export const inputClsFull =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";

/** Compact input on a neutral-900 surface: FloorManager.tsx. */
export const inputClsCompact =
  "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";

/** Canonical secondary button: methods, tariffs, users, permissions, types, specials, abonos. */
export const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

/** Compact secondary button: FloorManager.tsx (py-1 + font-medium). */
export const btnClsCompact =
  "rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

/** Compact secondary button without font-medium: HistorialTable.tsx. */
export const btnGhostCls =
  "rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40";

/** White "paper" primary button: ingreso-form.tsx / egreso-form.tsx. */
export const btnPrimaryCls =
  "rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60";

/** Danger button: FloorManager.tsx. */
export const btnDangerCls =
  "rounded-md border border-red-900 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-950 disabled:opacity-40";

/** Pill/badge chrome shared by tariffs and abonos status badges. */
export const badgeCls = "rounded-full border px-2 py-0.5 text-[11px] font-medium";

export type ClassValue = string | false | null | undefined;

/** Joins class strings, dropping empty values. */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
