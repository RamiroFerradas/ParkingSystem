import { NextResponse } from "next/server";
import { verify } from "@node-rs/argon2";
import { query } from "@/lib/db/client";
import { parseBody } from "@/lib/api/body";
import { loginBodySchema } from "@/lib/schemas/misc";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  type UserRole,
} from "@/lib/auth/session";

interface LoginRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_master: boolean;
  password_hash: string;
}

const GENERIC_ERROR = "Credenciales inválidas";

export async function POST(request: Request) {
  const { data } = await parseBody(request, loginBodySchema, GENERIC_ERROR);
  if (!data) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const { email, password } = data;

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const rows = await query<LoginRow>(
    `SELECT p.id, p.full_name, p.email, p.role::text AS role,
            p.is_master, c.password_hash
       FROM profiles p
       JOIN auth_credentials c ON c.user_id = p.id
      WHERE p.email = $1 AND p.is_active = true
      LIMIT 1`,
    [email],
  );
  const user = rows[0];

  if (!user) {
    await logFailedLogin(email);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const passwordOk = await verify(user.password_hash, password).catch(() => false);
  if (!passwordOk) {
    await logFailedLogin(email);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // A single membership is selected automatically; anything else asks the user
  // (or the master) to pick a branch before operating.
  const memberships = user.is_master
    ? []
    : (
        await query<{ branch_id: string }>(
          `SELECT ub.branch_id
             FROM user_branches ub
             JOIN branches b ON b.id = ub.branch_id AND b.is_active = true
            WHERE ub.user_id = $1
            ORDER BY b.name`,
          [user.id],
        )
      ).map((row) => row.branch_id);

  const activeBranchId =
    !user.is_master && memberships.length === 1 ? memberships[0] : null;

  const token = await createSessionToken({
    userId: user.id,
    activeBranchId: activeBranchId ?? null,
  });

  const response = NextResponse.json({
    ok: true,
    user: { name: user.full_name, role: user.role, isMaster: user.is_master },
    redirectTo: activeBranchId ? "/" : "/seleccionar-sucursal",
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

  await query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id)
     VALUES (gen_random_uuid(), $1, 'auth.login', 'profile', $2)`,
    [user.id, user.id],
  );

  return response;
}

async function logFailedLogin(email: string) {
  await query(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, after)
     VALUES (gen_random_uuid(), 'auth.login_failed', 'profile', $1,
             jsonb_build_object('email', $2))`,
    [email, email],
  ).catch(() => undefined);
}
