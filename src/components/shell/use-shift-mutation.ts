"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface ShiftMutationHandlers {
  /** Runs when the server answered `2xx`, before the router refresh. */
  onSuccess?: () => void;
  /** Runs when the server answered an error or was unreachable, before the refresh. */
  onError: (message: string) => void;
}

/**
 * Shared POST-an-empty-body mutation for the shift actions: one request, one
 * error message, one `router.refresh()`. Both callers keep their own surface
 * for the outcome (toast vs. inline alert), which is why the handlers run
 * before the refresh: the user-visible feedback must not wait on it.
 */
export function useShiftMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  async function run(
    path: string,
    fallbackError: string,
    handlers: ShiftMutationHandlers,
    body: Record<string, unknown> = {},
  ) {
    setPending(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        handlers.onError(data?.error ?? fallbackError);
        startRefresh(() => router.refresh());
        return;
      }
      handlers.onSuccess?.();
      startRefresh(() => router.refresh());
    } catch {
      // Sin respuesta del servidor no hay nada que refrescar.
      handlers.onError("Servidor no disponible");
    } finally {
      setPending(false);
    }
  }

  return { run, pending, busy: pending || isRefreshing };
}
