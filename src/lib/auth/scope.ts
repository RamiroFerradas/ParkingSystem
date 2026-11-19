import { getSessionUser } from "./session";
import { hasPermission } from "./permissions";

/**
 * Alcance de lectura de estadías para la sesión actual.
 * Sin `session.read_all` (caso empleado) se limita a lo abierto por el usuario,
 * que es lo que declara `session.read_own` en la matriz de permisos.
 */
export async function historialScopeForSession(): Promise<{
  userId: string;
  ownerId?: string;
} | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (await hasPermission(user.role, "session.read_all")) {
    return { userId: user.userId };
  }
  return { userId: user.userId, ownerId: user.userId };
}
