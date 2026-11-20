"use client";

import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";

/**
 * Feedback inmediato de navegación dentro de un `<Link>`.
 *
 * `useLinkStatus` solo puede usarse en un descendiente del link, por eso
 * `aria-busy` se aplica al contenedor interno: el ancla en sí no es alcanzable
 * desde el hook. El punto ámbar se suma sin desplazar el texto porque el
 * contenedor reserva el espacio con `justify-between`.
 */
export function LinkPendingContent({
  children,
  className = "flex w-full items-center justify-between gap-2",
  hintClassName = "",
}: {
  children: ReactNode;
  className?: string;
  hintClassName?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending || undefined} className={className}>
      {children}
      {pending ? (
        <span
          aria-hidden="true"
          data-link-pending="true"
          className={`h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300 ${hintClassName}`}
        />
      ) : null}
    </span>
  );
}
