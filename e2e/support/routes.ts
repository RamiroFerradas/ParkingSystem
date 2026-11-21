/**
 * Dashboard routes the smoke project renders in isolation.
 * Dynamic routes (`/reportes/turnos/[id]`) need a real record and belong to a
 * journey, not to the smoke sweep.
 */
export const APP_ROUTES = [
  { name: "dashboard", path: "/" },
  { name: "operaciones-ingreso", path: "/operaciones/ingreso" },
  { name: "operaciones-egreso", path: "/operaciones/egreso" },
  { name: "operaciones-estadias", path: "/operaciones/estadias" },
  { name: "operaciones-historial", path: "/operaciones/historial" },
  { name: "vehiculos", path: "/vehiculos" },
  { name: "vehiculos-tipos", path: "/vehiculos/tipos" },
  { name: "boxes-mapa", path: "/boxes/mapa" },
  { name: "boxes-administracion", path: "/boxes/administracion" },
  { name: "tarifas-productos", path: "/tarifas/productos" },
  { name: "tarifas-especiales", path: "/tarifas/especiales" },
  { name: "tarifas-abonados", path: "/tarifas/abonados" },
  { name: "reportes", path: "/reportes" },
  { name: "reportes-boxes", path: "/reportes/boxes" },
  { name: "reportes-abonados", path: "/reportes/abonados" },
  { name: "reportes-turnos", path: "/reportes/turnos" },
  { name: "administracion-usuarios", path: "/administracion/usuarios" },
  { name: "administracion-turnos", path: "/administracion/turnos" },
  { name: "administracion-medios-de-pago", path: "/administracion/medios-de-pago" },
  { name: "administracion-auditoria", path: "/administracion/auditoria" },
  { name: "administracion-sincronizacion", path: "/administracion/sincronizacion" },
  { name: "sucursales", path: "/sucursales" },
] as const;

/**
 * Plate that survives `normalizePlate` (A-Z0-9) and is unique per run, so the
 * ingreso journey never collides with a leftover stay.
 */
export function uniquePlate(): string {
  const digits = String(Math.floor(Math.random() * 900) + 100);
  return `AA${digits}BB`;
}
