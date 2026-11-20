"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Aviso de conectividad (§G del pedido). Solo se muestra cuando está offline:
 * un badge verde permanente entrena a la gente a ignorarlo.
 */
export function ConnectivityBadge() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400"
      role="status"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Sin conexión
    </span>
  );
}
