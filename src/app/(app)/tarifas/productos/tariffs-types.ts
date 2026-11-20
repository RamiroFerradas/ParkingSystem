/** Tipos y helpers compartidos por las pantallas de tarifas por vehículo. */

export interface TariffView {
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
  // Hora local de Córdoba ya formateada para `datetime-local` (la calcula la
  // base): evita diferencias entre el server y el navegador.
  valid_from_local: string;
  valid_to_local: string | null;
}

export interface VehicleTypeOpt {
  id: string;
  name: string;
}

export type Call = (
  url: string,
  method: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

const ART_OFFSET = "-03:00"; // Córdoba, sin horario de verano.

export const hoursLabel = (minutes: number | null) =>
  minutes === null ? "Mensual" : minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;

export const centsToPesosInput = (cents: string) => (Number(cents) / 100).toFixed(2);
export const isHourly = (t: TariffView) => t.kind === "hourly";
export const isMonthly = (t: TariffView) => t.kind === "monthly";

/** `datetime-local` (hora Córdoba) → ISO. */
export const localToIso = (value: string) => new Date(`${value}:00${ART_OFFSET}`).toISOString();

export function validityOf(t: TariffView) {
  if (!t.valid_to) return { text: "Fija", cls: "border-neutral-700 text-neutral-400" };
  const now = Date.now();
  const from = new Date(t.valid_from).getTime();
  const to = new Date(t.valid_to).getTime();
  if (to <= now) return { text: "Vencida", cls: "border-neutral-700 text-neutral-500" };
  if (from > now) return { text: "Programada", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
  return { text: "Temporal", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
}
