import { CARD, HeaderSkeleton, Skeleton, TableRows } from "./primitives";

export function TableBody() {
  return (
    <>
      <HeaderSkeleton action />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-full sm:w-56" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="ml-auto h-10 w-24" />
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-4 border-b border-neutral-800 bg-neutral-900 px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        <TableRows />
      </div>
    </>
  );
}
