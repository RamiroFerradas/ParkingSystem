import { cache } from "react";
import { redirect } from "next/navigation";
import { query } from "@/lib/db/client";
import { permissionsFor } from "./permissions";
import { getSessionUser, type SessionUser, type UserRole } from "./session";

export interface BranchMembership {
  branchId: string;
  branchName: string;
  role: UserRole;
}

export interface BranchContext {
  user: SessionUser;
  /** Non-null for every operational request. Null only for a master outside a branch. */
  branchId: string | null;
  branchName: string | null;
  role: UserRole | null;
  isMaster: boolean;
  memberships: BranchMembership[];
  can: (permission: string) => boolean;
}

/**
 * Resuelve, en un solo lugar, qué usuario es, en qué sucursal está operando y
 * qué puede hacer ahí. Es la única fuente de `branchId` para páginas y rutas:
 * nunca se toma una sucursal de un query string.
 */
const loadBranchContext = cache(async (): Promise<BranchContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.isMaster) {
    const rows = await query<{ id: string; name: string }>(
      "SELECT id, name FROM branches WHERE is_active = true ORDER BY name",
    );
    return {
      user,
      branchId: user.branchId,
      branchName: user.branchName,
      role: user.role,
      isMaster: true,
      memberships: rows.map((row) => ({
        branchId: row.id,
        branchName: row.name,
        role: "admin" as const,
      })),
      can: () => true,
    };
  }

  const rows = await query<{ branch_id: string; name: string; role: UserRole }>(
    `SELECT ub.branch_id, b.name, ub.role
       FROM user_branches ub
       JOIN branches b ON b.id = ub.branch_id AND b.is_active = true
      WHERE ub.user_id = $1
      ORDER BY b.name`,
    [user.userId],
  );

  const can = await permissionsFor(user);

  return {
    user,
    branchId: user.branchId,
    branchName: user.branchName,
    role: user.branchId ? user.role : null,
    isMaster: false,
    memberships: rows.map((row) => ({
      branchId: row.branch_id,
      branchName: row.name,
      role: row.role,
    })),
    can,
  };
});

export const getBranchContext = cache(async (): Promise<BranchContext | null> => {
  return loadBranchContext();
});

/** For pages: throws a redirect when there is no valid session. */
export async function requireBranchContext(): Promise<BranchContext> {
  const context = await getBranchContext();
  if (!context) {
    redirect("/login?expired=1");
  }
  return context;
}

/**
 * For API handlers: returns the context or a typed failure. `permission` is
 * optional because some routes only need a valid branch.
 */
export async function getBranchContextOrFail(
  permission?: string,
): Promise<
  | { context: BranchContext & { branchId: string }; error: null }
  | { context: null; error: { status: number; body: { error: string } } }
> {
  const context = await getBranchContext();
  if (!context) {
    return { context: null, error: { status: 401, body: { error: "Sesión requerida" } } };
  }
  if (!context.branchId) {
    return {
      context: null,
      error: { status: 403, body: { error: "Seleccioná una sucursal" } },
    };
  }
  if (permission && !context.can(permission)) {
    return {
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    };
  }
  return { context: context as BranchContext & { branchId: string }, error: null };
}
