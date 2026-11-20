import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { hash } from "@node-rs/argon2";

const ROLES = ["admin", "supervisor", "employee"] as const;

interface TargetRow {
  id: string;
  role: string;
  is_active: boolean;
}

/** Editar usuario: rol, activo/inactivo o reset de contraseña. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "user.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar usuarios" },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { isActive, role, password } = body;

  if (typeof password === "string" && (password.length < 8 || password.length > 72)) {
    return NextResponse.json(
      { error: "La contraseña debe tener entre 8 y 72 caracteres" },
      { status: 400 },
    );
  }
  if (role !== undefined && !ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  try {
    const target = await query<TargetRow>(
      `SELECT id, role::text AS role, is_active FROM profiles WHERE id = $1`,
      [id],
    );
    if (target.length === 0) {
      return NextResponse.json({ error: "Usuario inexistente" }, { status: 404 });
    }
    const t = target[0]!;

    // Auto-protección: no desactivarse ni quitarse el rol a sí mismo
    if (id === user.userId && (isActive === false || (typeof role === "string" && role !== "admin"))) {
      return NextResponse.json(
        { error: "No podés desactivarte o quitarte el rol a vos mismo" },
        { status: 400 },
      );
    }
    // Último admin activo: no desactivarlo ni degradarlo
    if (
      t.role === "admin" &&
      t.is_active &&
      (isActive === false || (typeof role === "string" && role !== "admin"))
    ) {
      const others = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM profiles
          WHERE role = 'admin' AND is_active AND id <> $1`,
        [id],
      );
      if ((others[0]?.n ?? 0) === 0) {
        return NextResponse.json(
          { error: "No podés dejar el sistema sin un administrador activo" },
          { status: 400 },
        );
      }
    }

    if (isActive !== undefined) {
      await query(
        `UPDATE profiles SET is_active = $2, updated_at = now() WHERE id = $1`,
        [id, Boolean(isActive)],
      );
    }
    if (typeof role === "string") {
      await query(
        `UPDATE profiles SET role = $2::user_role, updated_at = now() WHERE id = $1`,
        [id, role],
      );
    }
    if (typeof password === "string") {
      const passwordHash = await hash(password);
      await query(
        `INSERT INTO auth_credentials (user_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, password_updated_at = now()`,
        [id, passwordHash],
      );
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'user.update', 'profile', $2,
               jsonb_build_object('is_active', $3::jsonb, 'role', $4::text, 'password_reset', $5::boolean))`,
      [user.userId, id, isActive === undefined ? null : JSON.stringify(isActive), typeof role === "string" ? role : null, typeof password === "string"],
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
