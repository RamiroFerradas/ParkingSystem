import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { UsersManager, type ManagedUser } from "./users-manager";

export default async function UsuariosPage() {
  const context = await getBranchContext();
  if (!context) redirect("/login");
  if (!context.can("user.manage")) {
    return <AccessDenied message="Solo el administrador puede gestionar usuarios." />;
  }

  const { user, branchId, branchName, isMaster } = context;

  const branches = await query<{ id: string; name: string }>(
    "SELECT id, name FROM branches WHERE is_active = true ORDER BY name",
  );

  let rows: ManagedUser[];
  if (isMaster) {
    // El maestro ve a todos; `role` es el de la sucursal activa cuando el
    // usuario es miembro, o el rol legado del perfil cuando no lo es.
    rows = await query<ManagedUser>(
      `SELECT p.id, p.full_name, p.email,
              COALESCE(ub_active.role, p.role)::text AS role,
              p.is_active,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object('id', b.id, 'name', b.name, 'role', ub.role)
                  ORDER BY b.name
                ) FILTER (WHERE b.id IS NOT NULL),
                '[]'::jsonb
              ) AS branches
         FROM profiles p
         LEFT JOIN user_branches ub_active
           ON ub_active.user_id = p.id AND ub_active.branch_id = $1
         LEFT JOIN user_branches ub ON ub.user_id = p.id
         LEFT JOIN branches b ON b.id = ub.branch_id
        GROUP BY p.id, ub_active.role
        ORDER BY p.is_active DESC, role, p.email`,
      [branchId],
    );
  } else {
    if (!branchId) {
      return <AccessDenied message="Elegí una sucursal para gestionar usuarios." />;
    }
    // Un usuario común sólo ve a los miembros de su sucursal activa.
    rows = await query<ManagedUser>(
      `SELECT p.id, p.full_name, p.email, ub.role::text AS role, p.is_active,
              jsonb_build_array(
                jsonb_build_object('id', b.id, 'name', b.name, 'role', ub.role)
              ) AS branches
         FROM profiles p
         JOIN user_branches ub ON ub.user_id = p.id AND ub.branch_id = $1
         JOIN branches b ON b.id = ub.branch_id
        ORDER BY p.is_active DESC, ub.role, p.email`,
      [branchId],
    );
  }

  return (
    <UsersManager
      currentUserId={user.userId}
      currentBranchId={branchId}
      currentBranchName={branchName}
      isMaster={isMaster}
      branches={branches}
      users={rows}
    />
  );
}
