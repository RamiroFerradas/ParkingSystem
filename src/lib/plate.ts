/**
 * Normaliza una patente: solo A-Z y 0-9, en mayúsculas.
 * Descarta espacios, guiones, puntos y cualquier signo.
 */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
