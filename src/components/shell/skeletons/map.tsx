import { CARD, HeaderSkeleton, Skeleton } from "./primitives";

export function MapBody() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>
      {[0, 1].map((floor) => (
        <div key={floor} className={`${CARD} space-y-3 p-4`}>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {Array.from({ length: 16 }).map((_, tile) => (
              <Skeleton key={tile} className="h-16" />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
