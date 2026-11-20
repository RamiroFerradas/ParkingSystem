import { loadHistorialAll, parseHistorialFilters } from "@/lib/queries/historial";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { historialScopeForSession } from "@/lib/auth/scope";
import { historialExportQuerySchema, parseQuery } from "@/lib/schemas/misc";

const ART_TIME_ZONE = "America/Argentina/Cordoba";

function csvEscape(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** `toISOString()` es UTC: entre las 00:00 y las 03:00 ART fecha el día anterior. */
function artDateStamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ART_TIME_ZONE })
    .format(date)
    .replaceAll("-", "");
}

/** Export CSV del historial con los mismos filtros server-side que la página. */
export async function GET(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  // Mismo alcance que la página: quien no tiene `session.read_all` exporta
  // solo sus propias estadías.
  const scope = await historialScopeForSession();
  if (!scope) {
    return Response.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const filters = parseHistorialFilters(parseQuery(request, historialExportQuerySchema, {}));

  let rows: Awaited<ReturnType<typeof loadHistorialAll>>;
  try {
    rows = await loadHistorialAll(filters, scope);
  } catch (err) {
    return rpcErrorResponse(err);
  }

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
  const stamp = artDateStamp();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="historial-${stamp}.csv"`,
    },
  });
}
