import { CARD, Skeleton, TableRows } from "./primitives";

export function ReportsBody() {
  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-36 sm:h-7" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${CARD} h-24 p-4`}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${CARD} h-56 p-4`}>
          <Skeleton className="h-4 w-36" />
          <div className="mt-5 flex h-36 items-end gap-2">
            {[
              "h-16",
              "h-24",
              "h-12",
              "h-28",
              "h-20",
              "h-32",
              "h-14",
              "h-36",
              "h-24",
              "h-10",
              "h-28",
              "h-20",
            ].map((height, index) => (
              <Skeleton key={index} className={`w-full ${height}`} />
            ))}
          </div>
        </div>
        <div className={`${CARD} h-56 p-4`}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-36 w-full" />
        </div>
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-4 border-b border-neutral-800 px-4 py-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        <TableRows rows={6} cells={3} />
      </div>
    </>
  );
}
