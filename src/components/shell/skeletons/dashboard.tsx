import { CARD, HeaderSkeleton, Skeleton } from "./primitives";

export function DashboardBody() {
  return (
    <>
      <HeaderSkeleton action />
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className={`${CARD} col-span-2 h-32 p-4`}>
          <Skeleton className="h-4 w-32" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
        <div className={`${CARD} h-24 p-4`}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
        <div className={`${CARD} h-24 p-4`}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      </div>
      <div className={`${CARD} h-44 p-4`}>
        <Skeleton className="h-4 w-44" />
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <div className={`${CARD} h-48 p-4`}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-8 w-24" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
        <div className={`${CARD} h-48 p-4`}>
          <Skeleton className="h-4 w-36" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={`${CARD} h-20 p-4`}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={`${CARD} h-20 p-4`}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <div className={`${CARD} h-40 p-4`}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
        <div className={`${CARD} h-40 p-4`}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
      </div>
    </>
  );
}
