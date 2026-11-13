export interface NavItem {
  label: string;
  href?: string;
  enabled: boolean;
  note?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menú principal (§13 del pedido). Un ítem `enabled: false` se muestra
 * deshabilitado con su nota: entra cuando el módulo esté implementado
 * y conectado a la base (nunca botones muertos).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [{ label: "Dashboard", href: "/", enabled: true }],
  },
  {
    label: "Operaciones",
    items: [
      { label: "Registrar ingreso", href: "/operaciones/ingreso", enabled: true },
      { label: "Registrar egreso", href: "/operaciones/egreso", enabled: true },
      { label: "Estadías activas", href: "/operaciones/estadias", enabled: true },
      { label: "Historial", href: "/operaciones/historial", enabled: true },
    ],
  },
  {
    label: "Boxes",
    items: [
      { label: "Mapa de boxes", href: "/boxes/mapa", enabled: true },
      { label: "Administración", href: "/boxes/administracion", enabled: true },
    ],
  },
  {
    label: "Vehículos",
    items: [
      { label: "Listado", href: "/vehiculos", enabled: true },
      { label: "Tipos de vehículos", href: "/vehiculos/tipos", enabled: true },
    ],
  },
  {
    label: "Tarifas",
    items: [
      { label: "Productos tarifarios", href: "/tarifas/productos", enabled: true },
      { label: "Tarifas especiales", href: "/tarifas/especiales", enabled: true },
    ],
  },
  {
    label: "Estadísticas",
    items: [{ label: "Reportes", enabled: false, note: "Etapa G" }],
  },
  {
    label: "Administración",
    items: [
      { label: "Usuarios", href: "/administracion/usuarios", enabled: true },
      { label: "Medios de pago", href: "/administracion/medios-de-pago", enabled: true },
      { label: "Turnos de caja", href: "/administracion/turnos", enabled: true },
      { label: "Sincronización", enabled: false, note: "Etapa D6" },
      { label: "Auditoría", enabled: false, note: "Etapa H" },
    ],
  },
];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  employee: "Empleado",
};
