import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { parseBody } from "@/lib/api/body";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createUserSchema,
  isRole,
  isUuid,
  type CreateUserPayload,
  type Role,
} from "@/lib/schemas/users";
import { hash } from "@node-rs/argon2";

const PG_UNIQUE = "23505";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BranchRole {
  id: string;
  name: string;
  role: string;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  branches: BranchRole[];
}

interface Membership {
  branchId: string;
  role: Role;
}

/**
 * Listado de usuarios. Un usuario común sólo ve a los miembros de su sucursal
 * activa; el administrador global ve a todos con sus membresías.
 */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "user.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar usuarios" },
      { status: 403 },
    );
  }
  if (!user.isMaster && !user.branchId) {
    return NextResponse.json({ error: "Seleccioná una sucursal" }, { status: 403 });
  }

  try {
    const rows = user.isMaster
      ? await query<UserRow>(
          `SELECT p.id, p.full_name, p.email,
                  COALESCE(ub_active.role, p.role)::text AS role,
                  p.is_active, p.created_at::text,
                  COALESCE(
                    jsonb_agg(
                      jsonb_build_object('id', b.id, 'name', b.name, 'role', ub.role)
                      ORDER BY b.name
                    ) FILTER (WHERE b.id IS NOT NULL),
                    '[]'::jsonb
                  ) AS branches
             FROM profiles p
             LEFT JOIN user_branches ub_active
               ON ub_active.user_id = p.id AND ub_active.branch_id = $1
             LEFT JOIN user_branches ub ON ub.user_id = p.id
             LEFT JOIN branches b ON b.id = ub.branch_id
            GROUP BY p.id, ub_active.role
            ORDER BY p.is_active DESC, role, p.email`,
          [user.branchId],
        )
      : await query<UserRow>(
          `SELECT p.id, p.full_name, p.email, ub.role::text AS role,
                  p.is_active, p.created_at::text,
                  jsonb_build_array(
                    jsonb_build_object('id', b.id, 'name', b.name, 'role', ub.role)
                  ) AS branches
             FROM profiles p
             JOIN user_branches ub ON ub.user_id = p.id AND ub.branch_id = $1
             JOIN branches b ON b.id = ub.branch_id
            ORDER BY p.is_active DESC, ub.role, p.email`,
          [user.branchId],
        );
    return NextResponse.json({ users: rows });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

/** Alta de usuario (el admin crea los empleados desde la UI). */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "user.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar usuarios" },
      { status: 403 },
    );
  }

  const { data: body, error: bodyError } = await parseBody<CreateUserPayload>(
    request,
    createUserSchema,
    "Datos del usuario inválidos",
  );
  if (bodyError) return bodyError;

  const {
    email: cleanEmail,
    fullName: cleanName,
    role,
    password: cleanPassword,
    memberships: requestedMemberships,
  } = body;

  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 120) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (!cleanName || cleanName.length > 80) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  if (cleanPassword.length < 8 || cleanPassword.length > 72) {
    return NextResponse.json(
      { error: "La contraseña debe tener entre 8 y 72 caracteres" },
      { status: 400 },
    );
  }

  // Sin `memberships` se conserva el alta de siempre: una sola membresía en la
  // sucursal activa con el rol del payload.
  let memberships: Membership[];
  if (requestedMemberships === undefined) {
    if (!isRole(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
    if (!user.branchId) {
      return NextResponse.json({ error: "Seleccioná una sucursal" }, { status: 403 });
    }
    memberships = [{ branchId: user.branchId, role }];
  } else {
    if (requestedMemberships.length === 0) {
      return NextResponse.json(
        { error: "Asigná al menos una sucursal" },
        { status: 400 },
      );
    }
    if (!user.isMaster && !user.branchId) {
      return NextResponse.json({ error: "Seleccioná una sucursal" }, { status: 403 });
    }

    const seen = new Set<string>();
    const parsed: Membership[] = [];
    for (const item of requestedMemberships) {
      if (!isUuid(item.branchId)) {
        return NextResponse.json({ error: "Sucursal inválida" }, { status: 400 });
      }
      if (!isRole(item.role)) {
        return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
      }
      if (seen.has(item.branchId)) {
        return NextResponse.json({ error: "Sucursal duplicada" }, { status: 400 });
      }
      // Un usuario común sólo puede operar en su sucursal activa.
      if (!user.isMaster && item.branchId !== user.branchId) {
        return NextResponse.json(
          { error: "Solo podés asignar la sucursal activa" },
          { status: 403 },
        );
      }
      seen.add(item.branchId);
      parsed.push({ branchId: item.branchId, role: item.role });
    }
    memberships = parsed;
  }

  // `profiles.role` sigue existiendo para clientes viejos: guarda el rol de la
  // sucursal activa y, si el actor es global, el de la primera membresía.
  const activeMembership = memberships.find((m) => m.branchId === user.branchId);
  const profileRole = activeMembership?.role ?? memberships[0]!.role;

  try {
    // La sucursal activa ya la validó la sesión; las demás se comprueban acá.
    const branchRows =
      requestedMemberships === undefined
        ? [{ id: user.branchId!, name: user.branchName ?? "" }]
        : await query<{ id: string; name: string }>(
            `SELECT id, name FROM branches
              WHERE id = ANY($1::uuid[]) AND is_active = true`,
            [memberships.map((m) => m.branchId)],
          );

    if (branchRows.length !== memberships.length) {
      return NextResponse.json(
        { error: "Alguna sucursal no existe o está inactiva" },
        { status: 400 },
      );
    }

    const branchNameById = new Map(
      branchRows.map((branch) => [branch.id, branch.name]),
    );

    const passwordHash = await hash(cleanPassword); // Argon2id
    const client = await pool.connect();
    let created: UserRow;
    try {
      await client.query("BEGIN");
      const profile = await client.query<UserRow>(
        `INSERT INTO profiles (id, full_name, email, role)
         VALUES (gen_random_uuid(), $2, $1, $3::user_role)
         RETURNING id, full_name, email, role::text AS role, is_active, created_at::text`,
        [cleanEmail, cleanName, profileRole],
      );
      await client.query(
        `INSERT INTO auth_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [profile.rows[0]!.id, passwordHash],
      );
      // Todas las membresías elegidas, no sólo la de la sucursal activa.
      for (const membership of memberships) {
        await client.query(
          `INSERT INTO user_branches (user_id, branch_id, role)
           VALUES ($1, $2, $3::user_role)
           ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role`,
          [profile.rows[0]!.id, membership.branchId, membership.role],
        );
      }
      // El alta y su auditoría comparten transacción: si el actor ya no existe,
      // no queda un usuario creado sin rastro (ni un 409 en el reintento).
      await client.query(
        `INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
         VALUES (gen_random_uuid(), $1, $2, 'user.create', 'profile', $3,
                 jsonb_build_object(
                   'email', $4::text,
                   'role', $5::text,
                   'memberships', $6::jsonb
                 ))`,
        [
          user.userId,
          user.branchId,
          profile.rows[0]!.id,
          cleanEmail,
          profileRole,
          JSON.stringify(memberships),
        ],
      );
      await client.query("COMMIT");
      created = {
        ...profile.rows[0]!,
        role: profileRole,
        branches: memberships.map((membership) => ({
          id: membership.branchId,
          name: branchNameById.get(membership.branchId) ?? "",
          role: membership.role,
        })),
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, user: created }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err) {
      if ((err as { code?: string }).code === PG_UNIQUE) {
        return NextResponse.json(
          { error: "Ya existe un usuario con ese email" },
          { status: 409 },
        );
      }
    }
    return rpcErrorResponse(err);
  }
}
