import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { UsersManager, type ManagedUser } from "./users-manager";

export default async function UsuariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user.role, "user.manage"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Solo el administrador puede gestionar usuarios.
          </p>
        </div>
      </div>
    );
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
