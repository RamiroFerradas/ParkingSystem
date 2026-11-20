import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const source = body as Record<string, unknown>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const code = typeof source.code === "string" ? source.code.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

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
