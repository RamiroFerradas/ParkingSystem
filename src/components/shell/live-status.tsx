"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * El refresco automático nunca debe pisar lo que el usuario está escribiendo
 * ni cerrar un panel abierto: en un mostrador eso se siente como un error.
 */
function shouldHoldRefresh(): boolean {
  if (document.hidden) return true;
  if (document.querySelector('[role="dialog"], [role="menu"]')) return true;
  const element = document.activeElement as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable === true
  );
}

function formatRelative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return "ahora";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `hace ${minutes}m`;
}

/**
 * Latido de datos del shell: refresca los server components cada `intervalMs`
 * para que el dashboard y el mapa reflejen la cochera real sin recargar la
 * página. Se pausa solo cuando no hay foco, no hay red o el usuario está
 * escribiendo, y se reanuda al volver a la app.
 */
export function LiveStatus({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => {
      if (shouldHoldRefresh()) return;
      router.refresh();
      setLastSyncMs(Date.now());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [online, intervalMs, router]);

  useEffect(() => {
    if (!online) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || shouldHoldRefresh()) return;
      router.refresh();
      setLastSyncMs(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [online, router]);

  function refreshNow() {
    router.refresh();
    setLastSyncMs(Date.now());
  }

  const relative =
    lastSyncMs !== null && nowMs !== null
      ? formatRelative(nowMs - lastSyncMs)
      : null;

  return (
    <button
      type="button"
      onClick={refreshNow}
      title="Actualización automática cada 15 segundos. Tocá para actualizar ahora."
      aria-label={
        online
          ? "Datos en vivo. Actualizar ahora."
          : "Sin conexión. Reintentar cuando vuelva la red."
      }
      className="flex items-center gap-1.5 rounded-full border border-neutral-700/60 bg-neutral-800/60 px-2 py-1 text-[11px] font-medium text-neutral-300 hover:border-neutral-500"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {online ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
        ) : null}
        <span
          className={
            "relative inline-flex h-2 w-2 rounded-full " +
            (online ? "bg-emerald-400" : "bg-amber-400")
          }
        />
      </span>
      <span className="hidden xl:inline">{online ? "En vivo" : "Sin conexión"}</span>
      {relative ? (
        <span className="hidden text-[10px] tabular-nums text-neutral-500 xl:inline">
          {relative}
        </span>
      ) : null}
    </button>
  );
}
