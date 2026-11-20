import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import {
  hasPermission,
  loadPermissionMatrix,
  loadUserPermissionOverrides,
} from "@/lib/auth/permissions";
import { configurableSections } from "@/components/shell/nav-config";
import {
  permissionOverridesSchema,
  type PermissionOverridesPayload,
} from "@/lib/schemas/users";

interface TargetRow {
  id: string;
  role: string;
  is_active: boolean;
}

/**
 * Configurador de accesos por usuario: el rol da la base y `user_permissions`
 * permite habilitar o negar un permiso a una persona concreta. Sin excepción,
 * el permiso se hereda del rol (comportamiento anterior al configurador).
 */

// Serializa las escrituras de excepciones. Sin esto, dos revokes concurrentes
// de `user.manage` pueden pasar cada uno su chequeo y dejar al sistema sin
// nadie capaz de administrar usuarios.
const PERMISSIONS_LOCK_KEY = 918_273_645;

async function loadTarget(id: string): Promise<TargetRow | null> {
  const rows = await query<TargetRow>(
    `SELECT id, role::text AS role, is_active FROM profiles WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Lista las secciones configurables con el valor heredado y la excepción. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "user.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar accesos" },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!user.branchId) {
    return NextResponse.json({ error: "Seleccioná una sucursal" }, { status: 403 });
  }

  try {
    const target = await loadTarget(id);
    if (!target) {
      return NextResponse.json({ error: "Usuario inexistente" }, { status: 404 });
    }

    const [roleMatrix, overrides] = await Promise.all([
      loadPermissionMatrix(),
      loadUserPermissionOverrides(id, user.branchId),
    ]);

    const permissions = configurableSections().map((section) => {
      const roleAllowed =
        roleMatrix.get(`${target.role}:*`) === true ||
        roleMatrix.get(`${target.role}:${section.permission}`) === true;
      const override = overrides.has(section.permission)
        ? (overrides.get(section.permission) ?? null)
        : null;
      return {
        ...section,
        roleAllowed,
        override,
        effective: override ?? roleAllowed,
      };
    });

    return NextResponse.json({
      user: { id: target.id, role: target.role, isActive: target.is_active },
      permissions,
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

/** Evalúa un permiso con las excepciones dadas y la matriz de roles. */
function effective(
  role: string,
  overrides: Map<string, boolean>,
  roleMatrix: Map<string, boolean>,
  permission: string,
): boolean {
  const override = overrides.get(permission);
  if (override !== undefined) return override;
  return (
    roleMatrix.get(`${role}:*`) === true || roleMatrix.get(`${role}:${permission}`) === true
  );
}

/** Aplica excepciones: `allowed` true/false fija, `null` vuelve a heredar. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "user.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar accesos" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const branchId = user.branchId;
  if (!branchId) {
    return NextResponse.json({ error: "Seleccioná una sucursal" }, { status: 403 });
  }

  const { data: body, error: bodyError } = await parseBody<PermissionOverridesPayload>(
    request,
    permissionOverridesSchema,
    "Cuerpo inválido",
  );
  if (bodyError) return bodyError;

  const sections = configurableSections();
  const known = new Set(sections.map((section) => section.permission));
  const requested = new Map<string, boolean | null>();
  for (const item of body.overrides) {
    const { permission, allowed } = item;
    if (typeof permission !== "string" || !known.has(permission)) {
      return NextResponse.json(
        { error: `Permiso inválido: ${String(permission)}` },
        { status: 400 },
      );
    }
    if (allowed !== null && typeof allowed !== "boolean") {
      return NextResponse.json({ error: "Valor de permiso inválido" }, { status: 400 });
    }
    requested.set(permission, allowed);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [PERMISSIONS_LOCK_KEY]);

    const targetRows = await client.query<TargetRow>(
      `SELECT id, role::text AS role, is_active FROM profiles WHERE id = $1`,
      [id],
    );
    const target = targetRows.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Usuario inexistente" }, { status: 404 });
    }

    const roleRows = await client.query<{
      role: string;
      permission: string;
      allowed: boolean;
    }>("SELECT role, permission, allowed FROM role_permissions");
    const roleMatrix = new Map<string, boolean>();
    for (const row of roleRows.rows) {
      roleMatrix.set(`${row.role}:${row.permission}`, row.allowed);
    }

    const currentRows = await client.query<{ permission: string; allowed: boolean }>(
      "SELECT permission, allowed FROM user_permissions WHERE user_id = $1 AND branch_id = $2",
      [id, branchId],
    );
    const before = new Map<string, boolean>(
      currentRows.rows.map((row) => [row.permission, row.allowed]),
    );

    const afterState = new Map(before);
    for (const [permission, allowed] of requested) {
      if (allowed === null) afterState.delete(permission);
      else afterState.set(permission, allowed);
    }

    const manageBefore = effective(target.role, before, roleMatrix, "user.manage");
    const manageAfter = effective(target.role, afterState, roleMatrix, "user.manage");

    if (id === user.userId && manageBefore && !manageAfter) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "No podés quitarte el permiso de administrar usuarios a vos mismo" },
        { status: 400 },
      );
    }

    // El sistema no puede quedar sin ningún usuario activo que administre
    // usuarios. Se cuentan las excepciones reales de los demás, no el rol solo.
    if (target.is_active && manageBefore && !manageAfter) {
      const others = await client.query<{ role: string; allowed: boolean | null }>(
        `SELECT p.role::text AS role, up.allowed
           FROM profiles p
           LEFT JOIN user_permissions up
             ON up.user_id = p.id AND up.permission = 'user.manage' AND up.branch_id = $2
          WHERE p.is_active AND p.id <> $1`,
        [id, branchId],
      );
      const survivors = others.rows.filter((row) =>
        row.allowed === null
          ? roleMatrix.get(`${row.role}:*`) === true ||
            roleMatrix.get(`${row.role}:user.manage`) === true
          : row.allowed === true,
      ).length;
      if (survivors === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "No podés dejar el sistema sin un usuario activo que administre usuarios" },
          { status: 400 },
        );
      }
    }

    for (const [permission, allowed] of requested) {
      if (allowed === null) {
        await client.query(
          "DELETE FROM user_permissions WHERE user_id = $1 AND branch_id = $2 AND permission = $3",
          [id, branchId, permission],
        );
        continue;
      }
      await client.query(
        `INSERT INTO user_permissions (user_id, branch_id, permission, allowed, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, branch_id, permission) DO UPDATE
           SET allowed = EXCLUDED.allowed,
               updated_by = EXCLUDED.updated_by,
               updated_at = now()`,
        [id, branchId, permission, allowed, user.userId],
      );
    }

    // Toda escritura se audita, incluidas las vueltas a "heredado" (DELETE),
    // con el estado anterior y el posterior para poder reconstruir el cambio.
    if (requested.size > 0) {
      const beforeState = Object.fromEntries(
        [...requested.keys()].map((permission) => [
          permission,
          before.has(permission) ? before.get(permission) : null,
        ]),
      );
      const afterPayload = Object.fromEntries(
        [...requested.keys()].map((permission) => [permission, requested.get(permission)]),
      );
      await client.query(
        `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
         VALUES (gen_random_uuid(), $1, 'user.permissions', 'profile', $2,
                 jsonb_build_object('before', $3::jsonb, 'after', $4::jsonb))`,
        [user.userId, id, JSON.stringify(beforeState), JSON.stringify(afterPayload)],
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      overrides: Object.fromEntries(
        [...requested.entries()].filter(([, allowed]) => allowed !== null),
      ),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return rpcErrorResponse(err);
  } finally {
    client.release();
  }
}
