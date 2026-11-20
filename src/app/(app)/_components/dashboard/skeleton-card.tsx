export interface SkeletonCardProps {
  className?: string;
}

/** Placeholder de las tarjetas suspendidas del dashboard. */
export function SkeletonCard({ className = "" }: SkeletonCardProps) {
  return <div className={"h-24 animate-pulse rounded-xl bg-neutral-900 " + className} />;
}
