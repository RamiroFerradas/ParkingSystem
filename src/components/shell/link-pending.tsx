"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLinkStatus } from "next/link";

/**
 * Cuánto esperar antes de mostrar el punto ámbar. Las navegaciones rápidas
 * resuelven en una fracción de segundo: si el punto aparece ahí, se ve como un
 * parpadeo y no como información. Pasado este umbral, la espera ya se nota y
 * conviene avisar.
 */
const HINT_DELAY_MS = 250;

/**
 * Feedback de navegación dentro de un `<Link>`.
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
  showHint = true,
}: {
  children: ReactNode;
  className?: string;
  hintClassName?: string;
  /** false = sin punto ámbar (útil sobre el ítem que ya es la ruta actual). */
  showHint?: boolean;
}) {
  const { pending } = useLinkStatus();
  // Se ajusta en render (patrón oficial de React) en vez de en un efecto:
  // cada navegación arranca con el punto oculto.
  const [tracked, setTracked] = useState({ pending, slow: false });
  if (tracked.pending !== pending) setTracked({ pending, slow: false });

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setTracked((state) => (state.pending ? { ...state, slow: true } : state));
    }, HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const slow = pending && tracked.slow;

  return (
    <span aria-busy={pending || undefined} className={className}>
      {children}
      {pending && slow && showHint ? (
        <span
          aria-hidden="true"
          data-link-pending="true"
          className={`h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300 ${hintClassName}`}
        />
      ) : null}
    </span>
  );
}
