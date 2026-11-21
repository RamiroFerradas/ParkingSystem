/** Formato de moneda y fechas — ARS, es-AR, 24h (requisito global S6). */

/**
 * Zona del establecimiento. Se fija explícitamente porque el servidor y el
 * navegador deben formatear igual: si el server corre en UTC y el cliente en
 * ART, cada hora renderizada difiere y la hidratación falla (React #418).
 */
export const BUSINESS_TZ = "America/Argentina/Cordoba";
export function formatARS(cents: number | string | bigint): string {
  const value = typeof cents === "bigint" ? Number(cents) : Number(cents);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BUSINESS_TZ,
  }).format(new Date(date));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BUSINESS_TZ,
  }).format(new Date(date));
}

/** Minutos → "1 h 23 min" */
export function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}
