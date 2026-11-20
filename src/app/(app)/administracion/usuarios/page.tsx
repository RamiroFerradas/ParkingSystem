import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { UsersManager, type ManagedUser } from "./users-manager";

export default async function UsuariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "user.manage"))) {
    return <AccessDenied message="Solo el administrador puede gestionar usuarios." />;
  }

  const rows = await query<{
    id: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
  }>(
    `SELECT id, full_name, email, role::text AS role, is_active
       FROM profiles
      ORDER BY is_active DESC, role, email`,
  );

  return <UsersManager currentUserId={user.userId} users={rows as ManagedUser[]} />;
}
