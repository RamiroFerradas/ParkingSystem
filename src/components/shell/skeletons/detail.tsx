import { CARD, Skeleton, TableRows } from "./primitives";

export function DetailBody() {
  return (
    <>
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-44 sm:h-7" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
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
      <div className={`${CARD} overflow-hidden`}>
        <div className="border-b border-neutral-800 px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <TableRows rows={6} cells={4} />
      </div>
      <div className={`${CARD} flex items-center justify-between p-4`}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-24" />
      </div>
    </>
  );
}
