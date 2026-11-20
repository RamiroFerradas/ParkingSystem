import { FieldSkeleton, Skeleton } from "./primitives";

export function AuthBody() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-9 w-44 rounded-md" />
        <Skeleton className="h-5 w-full max-w-[15rem]" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="mt-6 space-y-4">
        <FieldSkeleton />
        <FieldSkeleton />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="mx-auto mt-4 h-3 w-48" />
    </div>
  );
}
