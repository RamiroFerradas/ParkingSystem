export interface NavItem {
  label: string;
  href?: string;
  enabled: boolean;
  note?: string;
  /** Permiso requerido para ver el ítem. Sin permiso, alcanza con la sesión. */
  permission?: string;
  /** Solo visible para el usuario master, sin importar el rol. */
  masterOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menú principal (§13 del pedido). Un ítem `enabled: false` se muestra
 * deshabilitado con su nota: entra cuando el módulo esté implementado
 * y conectado a la base (nunca botones muertos).
 *
 * `permission` refleja el permiso que exige la página destino: si el rol no
 * lo tiene, el ítem no se muestra (evita callejones sin salida).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [{ label: "Dashboard", href: "/", enabled: true }],
  },
  {
    label: "Operaciones",
    items: [
      {
        label: "Registrar ingreso",
        href: "/operaciones/ingreso",
        enabled: true,
        permission: "session.open",
      },
      {
        label: "Registrar egreso",
        href: "/operaciones/egreso",
        enabled: true,
        permission: "session.close",
      },
      { label: "Estadías activas", href: "/operaciones/estadias", enabled: true },
      { label: "Historial", href: "/operaciones/historial", enabled: true },
      {
        label: "Turnos de caja",
        href: "/administracion/turnos",
        enabled: true,
        permission: "shift.manage",
      },
    ],
  },
  {
    label: "Boxes",
    items: [
      { label: "Mapa de boxes", href: "/boxes/mapa", enabled: true, permission: "box.read" },
      {
        label: "Estructura",
        href: "/boxes/administracion",
        enabled: true,
        permission: "box.manage",
      },
    ],
  },
  {
    label: "Vehículos",
    items: [
      {
        label: "Listado",
        href: "/vehiculos",
        enabled: true,
        permission: "vehicle.read_all",
      },
      {
        label: "Tipos de vehículos",
        href: "/vehiculos/tipos",
        enabled: true,
        permission: "vehicle.manage",
      },
    ],
  },
  {
    label: "Tarifas",
    items: [
      {
        label: "Productos tarifarios",
        href: "/tarifas/productos",
        enabled: true,
        permission: "tariff.manage",
      },
      {
        label: "Tarifas especiales",
        href: "/tarifas/especiales",
        enabled: true,
        permission: "tariff.manage",
      },
      {
        label: "Abonados mensuales",
        href: "/tarifas/abonados",
        enabled: true,
        permission: "tariff.manage",
      },
    ],
  },
  {
    label: "Estadísticas",
    items: [
      { label: "Reportes", href: "/reportes", enabled: true, permission: "reports.read" },
      {
        label: "Ranking de boxes",
        href: "/reportes/boxes",
        enabled: true,
        permission: "reports.read",
      },
      {
        label: "Reporte de turnos",
        href: "/reportes/turnos",
        enabled: true,
        permission: "reports.read",
      },
      {
        label: "Impacto de abonos",
        href: "/reportes/abonados",
        enabled: true,
        permission: "reports.read",
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        label: "Sucursales",
        href: "/sucursales",
        enabled: true,
        masterOnly: true,
      },
      {
        label: "Usuarios",
        href: "/administracion/usuarios",
        enabled: true,
        permission: "user.manage",
      },
      {
        label: "Medios de pago",
        href: "/administracion/medios-de-pago",
        enabled: true,
        permission: "tariff.manage",
      },
      {
        label: "Sincronización",
        href: "/administracion/sincronizacion",
        enabled: true,
        permission: "sync.manage",
      },
      {
        label: "Auditoría",
        href: "/administracion/auditoria",
        enabled: true,
        permission: "audit.read",
      },
    ],
  },
];

/**
 * Deja solo los ítems permitidos y descarta los grupos que quedan vacíos.
 * `allowed` evalúa un permiso para la sucursal activa. Los ítems `masterOnly`
 * se muestran únicamente al usuario master.
 */
export function filterNavGroups(
  groups: NavGroup[],
  allowed: (permission: string) => boolean,
  options: { isMaster?: boolean } = {},
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.masterOnly && !options.isMaster) return false;
        return !item.permission || allowed(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  employee: "Empleado",
};

/** Sección que el administrador puede habilitar o negar por usuario. */
export interface ConfigurableSection {
  permission: string;
  label: string;
  group: string;
}

/**
 * Fuente única del configurador de accesos: deriva de NAV_GROUPS los permisos
 * que gobiernan secciones del menú. Varios ítems pueden compartir permiso
 * (Tarifas y Medios de pago usan `tariff.manage`): se agrupan en una sola fila
 * para que el conmutador no tenga dos estados contradictorios.
 *
 * Dashboard, Estadías activas e Historial quedan afuera a propósito: se
 * gobiernan por sesión y por alcance de lectura (`session.read_all`/`read_own`),
 * no por una sección habilitable.
 */
export function configurableSections(): ConfigurableSection[] {
  const byPermission = new Map<string, ConfigurableSection>();
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.permission) continue;
      const existing = byPermission.get(item.permission);
      if (existing) {
        if (!existing.label.split(", ").includes(item.label)) {
          existing.label = `${existing.label}, ${item.label}`;
        }
        continue;
      }
      byPermission.set(item.permission, {
        permission: item.permission,
        label: item.label,
        group: group.label,
      });
    }
  }
  return [...byPermission.values()];
}
