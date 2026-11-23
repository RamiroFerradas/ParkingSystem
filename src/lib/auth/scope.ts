import { getBranchContext } from "./context";

/**
 * Alcance de lectura de estadías para la sesión actual.
 * - Sin `session.read_all` (caso empleado) se limita a lo que abrió el usuario,
 *   que es lo que declara `session.read_own` en la matriz de permisos.
 * - Siempre se limita a la sucursal activa: las estadías de otra sucursal no se
 *   listan, no se cobran y no se exportan.
 */
export async function historialScopeForSession(): Promise<{
  userId: string;
  branchId: string | null;
  ownerId?: string;
} | null> {
  const context = await getBranchContext();
  if (!context) return null;
  if (context.can("session.read_all")) {
    return { userId: context.user.userId, branchId: context.branchId };
  }
  return {
    userId: context.user.userId,
    branchId: context.branchId,
    ownerId: context.user.userId,
  };
}
