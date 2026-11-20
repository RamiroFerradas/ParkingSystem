import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { parseBody } from "@/lib/api/body";
import { getBranchContext } from "@/lib/auth/context";
import { createBranchSchema, type CreateBranchBody } from "@/lib/schemas/catalogs";

export async function GET() {
  const context = await getBranchContext();
  if (!context) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }
  if (!context.isMaster) {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  const branches = await query<{
    id: string;
    name: string;
    code: string | null;
    is_active: boolean;
    created_at: string;
  }>(
    `SELECT id, name, code, is_active, created_at
       FROM branches ORDER BY is_active DESC, name`,
  );
  return NextResponse.json({ branches });
}

export async function POST(request: Request) {
  const context = await getBranchContext();
  if (!context) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }
  if (!context.isMaster) {
    return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
  }

  const { data: body, error: bodyError } = await parseBody<CreateBranchBody>(
    request,
    createBranchSchema,
    "El nombre es obligatorio",
  );
  if (bodyError) return bodyError;

  const { name, code } = body;

  try {
    const rows = await query<{ id: string; name: string }>(
      `INSERT INTO branches (name, code)
       VALUES ($1, NULLIF($2, ''))
       RETURNING id, name`,
      [name, code],
    );
    const branch = rows[0];
    if (!branch) {
      return NextResponse.json(
        { error: "No se pudo crear la sucursal" },
        { status: 400 },
      );
    }
    // Every branch owns its ticket sequence from the moment it exists.
    await query(
      `INSERT INTO ticket_sequences (branch_id, next_value)
       VALUES ($1, 1) ON CONFLICT (branch_id) DO NOTHING`,
      [branch.id],
    );
    return NextResponse.json({ ok: true, branch }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("uq_branches_name") || message.includes("uq_branches_code")) {
      return NextResponse.json(
        { error: "Ya existe una sucursal con ese nombre o código." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "No se pudo crear la sucursal" }, { status: 400 });
  }
}
