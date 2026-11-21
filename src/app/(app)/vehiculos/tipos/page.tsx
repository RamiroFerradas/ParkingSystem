import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { TypesManager } from "./types-manager";

export default async function TiposPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "vehicle.manage"))) {
    return <AccessDenied message="Solo el administrador puede gestionar los tipos de vehículos." />;
  }

  const types = await query<{ id: string; code: string; name: string; is_active: boolean; sort_order: number }>(
    `SELECT id, code, name, is_active, sort_order FROM vehicle_types ORDER BY sort_order, name`,
  );

  return <TypesManager types={types} />;
}
