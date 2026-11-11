"use client";

import { useEffect, useState } from "react";

type Connectivity =
  | { state: "online" }
  | { state: "offline" };

const STYLES: Record<Connectivity["state"], string> = {
  online: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  offline: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const LABELS: Record<Connectivity["state"], string> = {
  online: "En línea",
  offline: "Sin conexión",
};

/**
 * Indicador de conectividad (§G del pedido). En la Etapa D6 se extiende con
 * los estados de sincronización (sincronizando / pendiente / error).
 */
export function ConnectivityBadge() {
  const [conn, setConn] = useState<Connectivity | null>(null);

  useEffect(() => {
    const update = () =>
      setConn(navigator.onLine ? { state: "online" } : { state: "offline" });
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!conn) return <div className="h-6 w-20" aria-hidden="true" />;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[conn.state]}`}
      role="status"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[conn.state]}
    </span>
  );
}
