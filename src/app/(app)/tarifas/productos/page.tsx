import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { TariffsManager } from "./tariffs-manager";

export default async function ProductosTarifariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "tariff.manage"))) {
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
      valid_from: string;
      valid_to: string | null;
      valid_from_local: string;
      valid_to_local: string | null;
    }>(
      `SELECT t.id, t.code, t.name, t.vehicle_type_id, vt.name AS vehicle_type_name,
              t.duration_minutes, t.duration_mode::text AS duration_mode, t.amount_cents::text, t.is_active,
              t.valid_from, t.valid_to,
              to_char(t.valid_from AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI') AS valid_from_local,
              CASE WHEN t.valid_to IS NULL THEN NULL
                   ELSE to_char(t.valid_to AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI')
              END AS valid_to_local
         FROM parking_tariffs t
         JOIN vehicle_types vt ON vt.id = t.vehicle_type_id
        ORDER BY vt.sort_order, t.duration_minutes, t.valid_from DESC`,
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order`,
    ),
  ]);

  return <TariffsManager tariffs={tariffs} vehicleTypes={types} />;
}
