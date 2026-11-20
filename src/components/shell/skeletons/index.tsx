/**
 * Primitivas de carga compartidas por los `loading.tsx` de cada ruta.
 *
 * No son decorativas: replican el ancho, el header y la densidad de la
 * pantalla destino para que el cambio de skeleton a contenido no mueva el
 * layout. Se renderizan en el servidor, así que no suman JavaScript.
 */

import { AuthBody } from "./auth";
import { DashboardBody } from "./dashboard";
import { DetailBody } from "./detail";
import { FormBody } from "./form";
import { MapBody } from "./map";
import { ReportsBody } from "./reports";
import { TableBody } from "./table";
import type { PageSkeletonVariant } from "./primitives";

export * from "./primitives";
export * from "./dashboard";
export * from "./table";
export * from "./form";
export * from "./map";
export * from "./reports";
export * from "./detail";
export * from "./auth";

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
