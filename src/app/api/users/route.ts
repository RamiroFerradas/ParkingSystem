import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db/client";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { hash } from "@node-rs/argon2";

const PG_UNIQUE = "23505";
const ROLES = ["admin", "supervisor", "employee"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

/** Listado de usuarios. Solo roles con user.manage. */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await hasPermission(user, "user.manage"))) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar usuarios" },
      { status: 403 },
    );
  }
  try {
    const rows = await query<UserRow>(
      `SELECT id, full_name, email, role::text AS role, is_active, created_at::text
         FROM profiles
        ORDER BY is_active DESC, role, email`,
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { email, fullName, role, password } = body;
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanName = typeof fullName === "string" ? fullName.trim() : "";
  const cleanPassword = typeof password === "string" ? password : "";

  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 120) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (!cleanName || cleanName.length > 80) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }
  if (cleanPassword.length < 8 || cleanPassword.length > 72) {
    return NextResponse.json(
      { error: "La contraseña debe tener entre 8 y 72 caracteres" },
      { status: 400 },
    );
  }

  try {
    const passwordHash = await hash(cleanPassword); // Argon2id
    const client = await pool.connect();
    let created: UserRow;
    try {
      await client.query("BEGIN");
      const profile = await client.query<UserRow>(
        `INSERT INTO profiles (id, full_name, email, role)
         VALUES (gen_random_uuid(), $2, $1, $3::user_role)
         RETURNING id, full_name, email, role::text AS role, is_active, created_at::text`,
        [cleanEmail, cleanName, role],
      );
      await client.query(
        `INSERT INTO auth_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [profile.rows[0]!.id, passwordHash],
      );
      await client.query("COMMIT");
      created = profile.rows[0]!;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await query(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
       VALUES (gen_random_uuid(), $1, 'user.create', 'profile', $2,
               jsonb_build_object('email', $3::text, 'role', $4::text))`,
      [user.userId, created.id, cleanEmail, role],
    );

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
