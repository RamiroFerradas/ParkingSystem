import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { MethodsManager } from "./methods-manager";

export default async function MediosDePagoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "tariff.manage"))) {
    return <AccessDenied message="Solo el administrador puede gestionar los medios de pago." />;
  }

  const methods = await query<{
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    sort_order: number;
  }>(`SELECT id, code, name, is_active, sort_order FROM payment_methods ORDER BY sort_order, name`);

  return <MethodsManager methods={methods} />;
}
