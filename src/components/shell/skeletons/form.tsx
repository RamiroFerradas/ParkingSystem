import { CARD, FieldSkeleton, HeaderSkeleton, Skeleton } from "./primitives";

export function FormBody({ twoColumn }: { twoColumn: boolean }) {
  const form = (
    <div className={`${CARD} space-y-4 p-5`}>
      <Skeleton className="h-4 w-36" />
      <FieldSkeleton />
      <FieldSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
      <FieldSkeleton wide />
      <Skeleton className="h-10 w-40" />
    </div>
  );

  if (!twoColumn) {
    return (
      <>
        <HeaderSkeleton />
        {form}
      </>
    );
  }

  return (
    <>
      <HeaderSkeleton />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {form}
        <div className={`${CARD} space-y-3 p-5`}>
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </>
  );
}
