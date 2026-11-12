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
      { label: "Listado", enabled: false, note: "Etapa D" },
      { label: "Tipos de vehículos", enabled: false, note: "Etapa D" },
    ],
  },
  {
    label: "Tarifas",
    items: [
      { label: "Productos tarifarios", enabled: false, note: "Etapa E" },
      { label: "Tarifas especiales", enabled: false, note: "Etapa E" },
    ],
  },
  {
    label: "Estadísticas",
    items: [{ label: "Reportes", enabled: false, note: "Etapa G" }],
  },
  {
    label: "Administración",
    items: [
      { label: "Usuarios", enabled: false, note: "Etapa C3" },
      { label: "Medios de pago", enabled: false, note: "Etapa E" },
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
