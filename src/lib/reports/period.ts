/** Períodos y zona horaria compartidos por los reportes. */
export const TZ = "America/Argentina/Cordoba";

export interface Period {
  key: string;
  label: string;
  where: (col: string) => string;
}

export const PERIODS: Period[] = [
  {
    key: "hoy",
    label: "Hoy",
    where: (c) => `(${c} AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`,
  },
  { key: "7", label: "7 días", where: (c) => `${c} >= now() - interval '7 days'` },
  { key: "30", label: "30 días", where: (c) => `${c} >= now() - interval '30 days'` },
  { key: "90", label: "90 días", where: (c) => `${c} >= now() - interval '90 days'` },
  {
    key: "mes",
    label: "Este mes",
    where: (c) =>
      `date_trunc('month', ${c} AT TIME ZONE '${TZ}') = date_trunc('month', now() AT TIME ZONE '${TZ}')`,
  },
  {
    key: "anio",
    label: "Este año",
    where: (c) =>
      `date_trunc('year', ${c} AT TIME ZONE '${TZ}') = date_trunc('year', now() AT TIME ZONE '${TZ}')`,
  },
];

/** Período por defecto: 30 días. */
export function resolvePeriod(key?: string): Period {
  return PERIODS.find((p) => p.key === key) ?? PERIODS[2]!;
}
