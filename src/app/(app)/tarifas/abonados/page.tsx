import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { AbonadosManager } from "./abonados-manager";

// La página consulta la DB en el servidor; en Next 16 dev la navegación se
// valida contra datos sin cachear. Se opta por ruta bloqueante (sin PPR).
export const instant = false;

export default async function AbonadosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "tariff.manage"))) {
    return <AccessDenied message="Solo el administrador puede gestionar abonos." />;
  }

  const methods = await query<{ id: string; name: string }>(
    `SELECT id, name FROM payment_methods WHERE is_active ORDER BY sort_order, name`,
  );

  return <AbonadosManager methods={methods} />;
}
