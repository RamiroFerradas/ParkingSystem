import { query } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { IngresoForm } from "./ingreso-form";
import { PrintQueuePanel } from "./print-queue";

interface IngresoData {
  vehicleTypes: { id: string; name: string }[];
  availableBoxes: { id: string; number: string; floor_name: string }[];
  shiftOpen: boolean;
}

async function loadIngresoData(): Promise<IngresoData> {
  const [vehicleTypes, availableBoxes, openShift] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order, name`,
    ),
    query<{ id: string; number: string; floor_name: string }>(
      `SELECT id, number, floor_name
         FROM box_status
        WHERE status = 'available'
        ORDER BY floor_sort, number`,
    ),
    query<{ id: string }>(
      `SELECT id FROM cash_shifts WHERE status = 'open' LIMIT 1`,
    ),
  ]);
  return { vehicleTypes, availableBoxes, shiftOpen: openShift.length > 0 };
}

// La página consulta la DB en el servidor; en Next 16 dev la navegación se
// valida contra datos sin cachear. Se opta por ruta bloqueante (sin PPR).
export const instant = false;

export default async function IngresoPage() {  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user, "session.open"))) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
          <p className="mt-1 text-sm text-neutral-300">
            No tenés habilitado el registro de ingresos.
          </p>
        </div>
      </div>
    );
  }
  const data = await loadIngresoData();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Registrar ingreso</h1>
        <p className="text-sm text-neutral-500">
          La fecha y hora se registran automáticamente. Ingresá la patente,
          elegí el box y confirmá.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <IngresoForm
          vehicleTypes={data.vehicleTypes}
          availableBoxes={data.availableBoxes}
          shiftOpen={data.shiftOpen}
        />
        <aside className="lg:sticky lg:top-6">
          <PrintQueuePanel />
        </aside>
      </div>
    </div>
  );
}
