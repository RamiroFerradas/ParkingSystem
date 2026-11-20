export type PageSkeletonVariant =
  | "dashboard"
  | "table"
  | "form"
  | "map"
  | "reports"
  | "detail"
  | "auth";

export const CARD = "rounded-xl border border-neutral-800 bg-neutral-900";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-neutral-800/60 ${className}`}
    />
  );
}

/** Título + subtítulo como los de cada página (h1 de 20px y bajada gris). */
export function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-6 w-40 sm:h-7" />
        <Skeleton className="h-3 w-64" />
      </div>
      {action ? <Skeleton className="h-10 w-28" /> : null}
    </div>
  );
}

export function TableRows({ rows = 8, cells = 4 }: { rows?: number; cells?: number }) {
  return (
    <div className="divide-y divide-neutral-800">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cells }).map((__, cell) => (
            <Skeleton
              key={cell}
              className={`h-3.5 ${cell === 0 ? "w-24" : cell === cells - 1 ? "ml-auto w-16" : "w-28"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FieldSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className={wide ? "h-20 w-full" : "h-10 w-full"} />
    </div>
  );
}
