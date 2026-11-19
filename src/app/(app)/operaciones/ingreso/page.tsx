import { query } from "@/lib/db/client";
import { IngresoForm } from "./ingreso-form";
import { PrintQueuePanel } from "./print-queue";

interface IngresoData {
  vehicleTypes: { id: string; name: string }[];
  availableBoxes: { id: string; number: string; floor_name: string }[];
}

async function loadIngresoData(): Promise<IngresoData> {
  const [vehicleTypes, availableBoxes] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order, name`,
    ),
    query<{ id: string; number: string; floor_name: string }>(
      `SELECT id, number, floor_name
         FROM box_status
        WHERE status = 'available'
        ORDER BY floor_sort, number`,
    ),
  ]);
  return { vehicleTypes, availableBoxes };
}

export default async function IngresoPage() {
  const data = await loadIngresoData();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Registrar ingreso</h1>
        <p className="text-sm text-neutral-500">
          La fecha y hora se registran automáticamente. Ingresá la patente,
          elegí el box y confirmá.
        </p>
      </header>
      <IngresoForm
        vehicleTypes={data.vehicleTypes}
        availableBoxes={data.availableBoxes}
      />
      <PrintQueuePanel />
    </div>
  );
}
