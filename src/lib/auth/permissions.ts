import { query } from "@/lib/db/client";

export type PermissionKey = string;

// Cache corta en memoria de proceso: la matriz de permisos cambia rara vez
// y solo por decisión administrativa; se re-lee al reiniciar el servidor.
let cache: { loadedAt: number; rows: Map<string, boolean> } | null = null;
const CACHE_TTL_MS = 60_000;

export async function loadPermissionMatrix(): Promise<Map<string, boolean>> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rows;
  }
  const rows = await query<{ role: string; permission: string; allowed: boolean }>(
    "SELECT role, permission, allowed FROM role_permissions",
  );
  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(`${row.role}:${row.permission}`, row.allowed);
  }
  cache = { loadedAt: now, rows: map };
  return map;
}

/**
 * Evalúa un permiso concreto para un rol.
 * 'admin' tiene wildcard '*'; las demás reglas son exactas.
 */
export async function hasPermission(
  role: string,
  permission: PermissionKey,
): Promise<boolean> {
  const matrix = await loadPermissionMatrix();
  return (
    matrix.get(`${role}:*`) === true || matrix.get(`${role}:${permission}`) === true
  );
}
