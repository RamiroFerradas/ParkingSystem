import { loadHistorialAll, parseHistorialFilters } from "@/lib/queries/historial";
import { requireUser } from "@/lib/api/guard";

function csvEscape(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Export CSV del historial con los mismos filtros server-side que la página. */
export async function GET(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const filters = parseHistorialFilters(raw);
  const rows = await loadHistorialAll(filters);

  const header = [
    "ticket",
    "ingreso",
    "egreso",
    "patente",
    "tipo",
    "box",
    "duracion_min",
    "cerro",
    "estado",
    "monto_cents",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.ticket_number,
        r.entry_at,
        r.exit_at ?? "",
        r.plate ?? "",
        r.vehicle_type_name,
        r.box_number,
        r.duration_minutes ?? "",
        r.closed_by_name ?? "",
        r.status,
        r.final_amount_cents ?? "",
      ]
        .map(csvEscape)
        .join(";"),
    );
  }

  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="historial-${stamp}.csv"`,
    },
  });
}
