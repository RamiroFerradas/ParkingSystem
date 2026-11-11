import { NextResponse } from "next/server";
import { verify } from "@node-rs/argon2";
import { query } from "@/lib/db/client";
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
  password_hash: string;
}

const GENERIC_ERROR = "Credenciales inválidas";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const email =
    typeof (body as Record<string, unknown>)?.email === "string"
      ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
      : "";
  const password =
    typeof (body as Record<string, unknown>)?.password === "string"
      ? ((body as Record<string, unknown>).password as string)
      : "";

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const rows = await query<LoginRow>(
    `SELECT p.id, p.full_name, p.email, p.role::text AS role, c.password_hash
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

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.full_name,
    role: user.role,
  });

  const response = NextResponse.json({
    ok: true,
    user: { name: user.full_name, role: user.role },
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
