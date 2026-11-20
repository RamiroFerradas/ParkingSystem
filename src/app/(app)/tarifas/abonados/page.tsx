import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AbonadosManager } from "./abonados-manager";

// La página consulta la DB en el servidor; en Next 16 dev la navegación se
// valida contra datos sin cachear. Se opta por ruta bloqueante (sin PPR).
export const instant = false;

export default async function AbonadosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "tariff.manage"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            Solo el administrador puede gestionar abonos.
          </p>
        </div>
      </div>
    );
  }

  const methods = await query<{ id: string; name: string }>(
    `SELECT id, name FROM payment_methods WHERE is_active ORDER BY sort_order, name`,
  );

  return <AbonadosManager methods={methods} />;
}
