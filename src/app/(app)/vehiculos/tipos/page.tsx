import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { TypesManager } from "./types-manager";

export default async function TiposPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "vehicle.manage"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Solo el administrador puede gestionar los tipos de vehículos.
          </p>
        </div>
      </div>
    );
  }

  const types = await query<{ id: string; code: string; name: string; is_active: boolean; sort_order: number }>(
    `SELECT id, code, name, is_active, sort_order FROM vehicle_types ORDER BY sort_order, name`,
  );

  return <TypesManager types={types} />;
}
