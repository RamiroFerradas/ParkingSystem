/**
 * Primitivas de carga compartidas por los `loading.tsx` de cada ruta.
 *
 * No son decorativas: replican el ancho, el header y la densidad de la
 * pantalla destino para que el cambio de skeleton a contenido no mueva el
 * layout. Se renderizan en el servidor, así que no suman JavaScript.
 */

export type PageSkeletonVariant =
  | "dashboard"
  | "table"
  | "form"
  | "map"
  | "reports"
  | "detail"
  | "auth";

const CARD = "rounded-xl border border-neutral-800 bg-neutral-900";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-neutral-800/60 ${className}`}
    />
  );
}

/** Título + subtítulo como los de cada página (h1 de 20px y bajada gris). */
function HeaderSkeleton({ action = false }: { action?: boolean }) {
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

function TableRows({ rows = 8, cells = 4 }: { rows?: number; cells?: number }) {
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

function FieldSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className={wide ? "h-20 w-full" : "h-10 w-full"} />
    </div>
  );
}

function DashboardBody() {
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

function TableBody() {
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

function FormBody({ twoColumn }: { twoColumn: boolean }) {
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

function MapBody() {
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

function ReportsBody() {
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

function DetailBody() {
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

function AuthBody() {
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

export function PageSkeleton({
  width = "max-w-5xl",
  variant,
}: {
  /** Ancho máximo real de la pantalla destino (p. ej. `max-w-lg`). */
  width?: string;
  variant: PageSkeletonVariant;
}) {
  if (variant === "auth") {
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex min-h-dvh items-center justify-center p-4 sm:p-8"
      >
        <span className="sr-only">Cargando…</span>
        <AuthBody />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className={`mx-auto w-full ${width} space-y-4 sm:space-y-6`}
    >
      <span className="sr-only">Cargando…</span>
      {variant === "dashboard" ? <DashboardBody /> : null}
      {variant === "table" ? <TableBody /> : null}
      {variant === "form" ? <FormBody twoColumn={width === "max-w-6xl"} /> : null}
      {variant === "map" ? <MapBody /> : null}
      {variant === "reports" ? <ReportsBody /> : null}
      {variant === "detail" ? <DetailBody /> : null}
    </div>
  );
}
