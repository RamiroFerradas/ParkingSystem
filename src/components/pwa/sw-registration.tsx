"use client";

import { useEffect } from "react";

/** Registra el Service Worker de la PWA (solo cliente). */
export function SwRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
