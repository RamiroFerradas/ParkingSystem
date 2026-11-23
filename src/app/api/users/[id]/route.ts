import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { hasPermission } from "@/lib/auth/permissions";
import {
  isRole,
  isUuid,
  updateUserSchema,
  type UpdateUserPayload,
} from "@/lib/schemas/users";
import { hash } from "@node-rs/argon2";

interface TargetRow {
  id: string;
  role: string;
  is_active: boolean;
  /** Role in the branch being edited; null when the user has no membership there. */
  branch_role: string | null;
  /** Whether the user is an admin in any branch (used when deactivating globally). */
  admin_anywhere: boolean;
}

/** Editar usuario: rol en la sucursal activa, activo/inactivo o reset de contraseña. */
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

  const { data: body, error: bodyError } = await parseBody<UpdateUserPayload>(
    request,
    updateUserSchema,
    "Datos del usuario inválidos",
  );
  if (bodyError) return bodyError;

  const { isActive, role, password, branchId: rawBranchId } = body;

  if (typeof password === "string" && (password.length < 8 || password.length > 72)) {
    return NextResponse.json(
      { error: "La contraseña debe tener entre 8 y 72 caracteres" },
      { status: 400 },
    );
  }
  if (role !== undefined && !isRole(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }
  if (!user.isMaster && !user.branchId) {
    return NextResponse.json({ error: "Seleccioná una sucursal" }, { status: 403 });
  }

  // Sólo el administrador global puede apuntar a otra sucursal.
  let requestedBranchId: string | null = null;
  if (rawBranchId !== undefined) {
    if (!isUuid(rawBranchId)) {
      return NextResponse.json({ error: "Sucursal inválida" }, { status: 400 });
    }
    if (!user.isMaster) {
      return NextResponse.json(
        { error: "Solo el administrador global puede elegir la sucursal" },
        { status: 403 },
      );
    }
    requestedBranchId = rawBranchId;
  }
  const targetBranchId = requestedBranchId ?? user.branchId;

  try {
    const target = await query<TargetRow>(
      `SELECT p.id, p.role::text AS role, p.is_active,
              ub.role::text AS branch_role,
              EXISTS (
                SELECT 1 FROM user_branches a
                 WHERE a.user_id = p.id AND a.role = 'admin'
              ) AS admin_anywhere
         FROM profiles p
         LEFT JOIN user_branches ub
           ON ub.user_id = p.id AND ub.branch_id = $2
        WHERE p.id = $1`,
      [id, targetBranchId],
    );
    if (target.length === 0) {
      return NextResponse.json({ error: "Usuario inexistente" }, { status: 404 });
    }
    const t = target[0]!;

    // Guarda de sucursal: un usuario común no puede tocar a alguien que no es
    // miembro de su sucursal activa. El maestro queda exento.
    if (!user.isMaster && t.branch_role === null) {
      return NextResponse.json({ error: "Usuario inexistente" }, { status: 404 });
    }
    if (requestedBranchId && t.branch_role === null) {
      return NextResponse.json(
        { error: "El usuario no pertenece a esa sucursal" },
        { status: 404 },
      );
    }

    // Auto-protección: no desactivarse ni quitarse el rol a sí mismo
    if (id === user.userId && (isActive === false || (typeof role === "string" && role !== "admin"))) {
      return NextResponse.json(
        { error: "No podés desactivarte o quitarte el rol a vos mismo" },
        { status: 400 },
      );
    }

    // Cambiar el rol exige una membresía concreta: la sucursal activa o la que
    // eligió el maestro. No se tocan las demás membresías del usuario.
    if (typeof role === "string") {
      if (!targetBranchId) {
        return NextResponse.json(
          { error: "Elegí una sucursal para cambiar el rol" },
          { status: 400 },
        );
      }
      if (t.branch_role === null) {
        return NextResponse.json(
          { error: "El usuario no pertenece a la sucursal activa" },
          { status: 400 },
        );
      }
    }

    // Último admin: al desactivar se mira el sistema completo; al degradar, la
    // sucursal objetivo.
    const demoting = typeof role === "string" && role !== "admin";
    const deactivating = isActive === false;
    const adminInScope = deactivating
      ? t.admin_anywhere || t.role === "admin"
      : t.branch_role === "admin";
    if (t.is_active && adminInScope && (demoting || deactivating)) {
      const others = await query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM user_branches ub
           JOIN profiles p ON p.id = ub.user_id
          WHERE ub.role = 'admin' AND p.is_active AND ub.user_id <> $1
            AND ($2::uuid IS NULL OR ub.branch_id = $2)`,
        [id, deactivating ? null : targetBranchId],
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
      // El rol efectivo sale de `user_branches` (la sucursal manda). Se cambia
      // sólo la membresía objetivo: el resto de las sucursales conserva el suyo.
      await query(
        `UPDATE user_branches SET role = $3::user_role
          WHERE user_id = $1 AND branch_id = $2`,
        [id, targetBranchId!, role],
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
      `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, $2, 'user.update', 'profile', $3,
               jsonb_build_object('is_active', $4::jsonb, 'role', $5::text, 'password_reset', $6::boolean))`,
      [
        user.userId,
        targetBranchId,
        id,
        isActive === undefined ? null : JSON.stringify(isActive),
        typeof role === "string" ? role : null,
        typeof password === "string",
      ],
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
