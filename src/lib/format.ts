/** Formato de moneda y fechas — ARS, es-AR, 24h (requisito global S6). */
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
  }).format(new Date(date));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

/** Minutos → "1 h 23 min" */
export function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}
