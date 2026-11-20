import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";

/** Payload completo de una estadía para (re)imprimir su ticket. */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
  }

  try {
    const rows = await query<{
      ticket_number: string;
      plate: string | null;
      vehicle_type_name: string;
      box_number: string;
      entry_at: string;
      exit_at: string | null;
      status: string;
      duration_minutes: number | null;
      base_amount_cents: string | null;
      discount_cents: string | null;
      surcharge_cents: string | null;
      final_amount_cents: string | null;
      method_name: string | null;
      tariff_snapshot: Record<string, unknown> | null;
      entry_notes: string | null;
      key_left: boolean;
      damage_notes: string | null;
    }>(
      `SELECT s.ticket_number::text, v.plate, vt.name AS vehicle_type_name, b.number AS box_number,
              s.entry_at::text, s.exit_at::text, s.status::text AS status,
              s.duration_minutes, s.base_amount_cents::text, p.discount_cents::text,
              p.surcharge_cents::text, p.amount_charged_cents::text AS final_amount_cents,
              m.name AS method_name, s.tariff_snapshot, s.entry_notes,
              s.key_left, s.damage_notes
         FROM parking_sessions s
         JOIN vehicles v ON v.id = s.vehicle_id
         JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
         JOIN parking_boxes b ON b.id = s.box_id
         LEFT JOIN payments p ON p.session_id = s.id
         LEFT JOIN payment_methods m ON m.id = p.method_id
        WHERE s.id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Estadía no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ session: rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
