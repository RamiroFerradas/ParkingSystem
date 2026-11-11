// Service Worker mínimo: caché del shell para operación offline en la LAN.
// Las escrituras operativas SIEMPRE van al servidor local por HTTP
// (IndexedDB solo como caché — requisito explícito del pedido).
const CACHE = "parking-shell-v1";
const STATIC_PREFIXES = ["/_next/static/", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isStatic = STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (!isStatic && request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok && isStatic) {
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await cache.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
