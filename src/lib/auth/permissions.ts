import { query } from "@/lib/db/client";

export type PermissionKey = string;

/** Sujeto de autorización: el rol da la base, el usuario puede tener excepciones. */
export interface PermissionSubject {
  userId: string;
  role: string;
}

// La matriz de roles se cachea en memoria: cambia rara vez y solo por decisión
// administrativa (migraciones), así que un TTL corto es seguro. Las excepciones
// por usuario NO se cachean: páginas y route handlers corren en instancias
// separadas y una caché local no se puede invalidar entre ellas. Una revocación
// tiene que aplicar en el siguiente request, no dentro de 30 segundos.
const CACHE_TTL_MS = 60_000;

let roleCache: { loadedAt: number; rows: Map<string, boolean> } | null = null;

/** Matriz de roles: clave `rol:permiso` (incluye el wildcard `rol:*`). */
export async function loadPermissionMatrix(): Promise<Map<string, boolean>> {
  const now = Date.now();
  if (roleCache && now - roleCache.loadedAt < CACHE_TTL_MS) {
    return roleCache.rows;
  }
  const rows = await query<{ role: string; permission: string; allowed: boolean }>(
    "SELECT role, permission, allowed FROM role_permissions",
  );
  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(`${row.role}:${row.permission}`, row.allowed);
  }
  roleCache = { loadedAt: now, rows: map };
  return map;
}

/** Excepciones del usuario: clave `permiso`, valor permitido/denegado. */
export async function loadUserPermissionOverrides(
  userId: string,
): Promise<Map<string, boolean>> {
  const rows = await query<{ permission: string; allowed: boolean }>(
    "SELECT permission, allowed FROM user_permissions WHERE user_id = $1",
    [userId],
  );
  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(row.permission, row.allowed);
  }
  return map;
}

/**
 * Evalúa un permiso para un rol sin excepciones por usuario. Se usa para
 * mostrar el valor heredado en el configurador.
 */
export async function roleHasPermission(
  role: string,
  permission: PermissionKey,
): Promise<boolean> {
  const matrix = await loadPermissionMatrix();
  return (
    matrix.get(`${role}:*`) === true || matrix.get(`${role}:${permission}`) === true
  );
}

function decide(
  roleMatrix: Map<string, boolean>,
  overrides: Map<string, boolean>,
  role: string,
  permission: PermissionKey,
): boolean {
  // La excepción explícita gana sobre el rol, incluso sobre el wildcard '*'.
  const override = overrides.get(permission);
  if (override !== undefined) return override;
  return (
    roleMatrix.get(`${role}:*`) === true || roleMatrix.get(`${role}:${permission}`) === true
  );
}

/**
 * Evalúa un permiso concreto para un usuario: excepción por usuario primero,
 * después la matriz del rol. 'admin' tiene wildcard '*'.
 */
export async function hasPermission(
  user: PermissionSubject,
  permission: PermissionKey,
): Promise<boolean> {
  const [roleMatrix, overrides] = await Promise.all([
    loadPermissionMatrix(),
    loadUserPermissionOverrides(user.userId),
  ]);
  return decide(roleMatrix, overrides, user.role, permission);
}

/**
 * Devuelve un evaluador de permisos para un usuario. Las matrices se leen una
 * sola vez (con su cache), útil para filtrar listas de ítems sin N consultas.
 */
export async function permissionsFor(
  user: PermissionSubject,
): Promise<(permission: PermissionKey) => boolean> {
  const [roleMatrix, overrides] = await Promise.all([
    loadPermissionMatrix(),
    loadUserPermissionOverrides(user.userId),
  ]);
  return (permission) => decide(roleMatrix, overrides, user.role, permission);
}
