import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { TariffsManager } from "./tariffs-manager";

// La página consulta la DB en el servidor; en Next 16 dev la navegación se
// valida contra datos sin cachear. Se opta por ruta bloqueante (sin PPR).
export const instant = false;

export default async function ProductosTarifariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "tariff.manage"))) {
    return <AccessDenied message="Solo el administrador puede gestionar el tarifario." />;
  }

  const [tariffs, types] = await Promise.all([
    query<{
      id: string;
      kind: string;
      code: string | null;
      name: string;
      vehicle_type_id: string;
      vehicle_type_name: string;
      duration_minutes: number | null;
      duration_mode: string;
      amount_cents: string;
      is_active: boolean;
      valid_from: string;
      valid_to: string | null;
      valid_from_local: string;
      valid_to_local: string | null;
    }>(
      `SELECT t.id, t.kind::text AS kind, t.code, t.name, t.vehicle_type_id,
              vt.name AS vehicle_type_name,
              t.duration_minutes, t.duration_mode::text AS duration_mode, t.amount_cents::text, t.is_active,
              t.valid_from, t.valid_to,
              to_char(t.valid_from AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI') AS valid_from_local,
              CASE WHEN t.valid_to IS NULL THEN NULL
                   ELSE to_char(t.valid_to AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD"T"HH24:MI')
              END AS valid_to_local
         FROM parking_tariffs t
         JOIN vehicle_types vt ON vt.id = t.vehicle_type_id
        WHERE t.branch_id = $1
        ORDER BY vt.sort_order, t.kind, t.duration_minutes NULLS LAST, t.valid_from DESC`,
      [user.branchId],
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order`,
    ),
  ]);

  return <TariffsManager tariffs={tariffs} vehicleTypes={types} />;
}
