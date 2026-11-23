import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { SpecialsManager } from "./specials-manager";

export default async function TarifasEspecialesPage() {
  const context = await getBranchContext();
  if (!context) redirect("/login");
  if (!context.branchId) redirect("/seleccionar-sucursal");
  if (!context.can("tariff.manage")) {
    return <AccessDenied message="Solo el administrador puede gestionar tarifas especiales." />;
  }
  const branchId = context.branchId;

  const [specials, types] = await Promise.all([
    query<{
      id: string;
      name: string;
      starts_at: string;
      ends_at: string;
      vehicle_type_ids: string[];
      adjustment_type: string;
      adjustment_value: string;
      priority: number;
      status: string;
    }>(
      `SELECT id, name, starts_at::text, ends_at::text, vehicle_type_ids,
              adjustment_type::text AS adjustment_type, adjustment_value::text, priority,
              status::text AS status
         FROM special_tariff_periods
        WHERE branch_id = $1::uuid
        ORDER BY starts_at DESC
        LIMIT 100`,
      [branchId],
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order`,
    ),
  ]);

  return <SpecialsManager specials={specials} vehicleTypes={types} />;
}
