import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { TariffsManager } from "./tariffs-manager";

export default async function ProductosTarifariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user.role, "tariff.manage"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Solo el administrador puede gestionar el tarifario.
          </p>
        </div>
      </div>
    );
  }

  const [tariffs, types] = await Promise.all([
    query<{
      id: string;
      code: string | null;
      name: string;
      vehicle_type_id: string;
      vehicle_type_name: string;
      duration_minutes: number;
      duration_mode: string;
      amount_cents: string;
      is_active: boolean;
    }>(
      `SELECT t.id, t.code, t.name, t.vehicle_type_id, vt.name AS vehicle_type_name,
              t.duration_minutes, t.duration_mode::text AS duration_mode, t.amount_cents::text, t.is_active
         FROM parking_tariffs t
         JOIN vehicle_types vt ON vt.id = t.vehicle_type_id
        ORDER BY vt.sort_order, t.duration_minutes`,
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order`,
    ),
  ]);

  return <TariffsManager tariffs={tariffs} vehicleTypes={types} />;
}
