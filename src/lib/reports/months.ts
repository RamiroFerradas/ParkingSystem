import { TZ } from "@/lib/reports/period";

/** Bucket mensual de las series de 12 meses. */
export interface MonthBucket {
  /** `YYYY-MM` en la zona del establecimiento. */
  month: string;
  /** Etiqueta corta, p. ej. `sep 25`. */
  label: string;
}

/** Los últimos 12 meses (incluido el actual), en la zona del establecimiento. */
export function lastTwelveMonths(): MonthBucket[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (11 - index), 1));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const short = new Intl.DateTimeFormat("es-AR", {
      month: "short",
      timeZone: "UTC",
    })
      .format(date)
      .replace(".", "");
    return { month: `${y}-${m}`, label: `${short} ${String(y).slice(2)}` };
  });
}

/** Mes actual (YYYY-MM) en la zona horaria del establecimiento. */
export function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** `YYYY-MM` → mes largo en es-AR, p. ej. `septiembre de 2025`. */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1)));
}
