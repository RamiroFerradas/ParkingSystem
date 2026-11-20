import { formatElapsed } from "@/lib/format";

/** A partir de acá el shell insiste con el cierre: una jornada ya terminó. */
export const LONG_SHIFT_MINUTES = 8 * 60;

export function formatElapsedText(minutes: number): string {
  return minutes < 1 ? "Recién abierto" : `Hace ${formatElapsed(minutes)}`;
}

export function shiftNoun(count: number): string {
  return count === 1 ? "vehículo" : "vehículos";
}
