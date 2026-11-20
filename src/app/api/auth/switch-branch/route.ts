import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";

/**
 * Reissues the session cookie for another branch. A master may switch to any
 * active branch; everyone else only to a branch they belong to. The branch id
 * comes from the body but is re-validated against the database, never trusted.
 */
export async function POST(request: Request) {
  const context = await getBranchContext();
  if (!context) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const branchId =
    typeof (body as Record<string, unknown>)?.branchId === "string"
      ? ((body as Record<string, unknown>).branchId as string)
      : "";

  if (!branchId) {
    return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 });
  }

  const active = await query<{ id: string }>(
    "SELECT id FROM branches WHERE id = $1 AND is_active = true",
    [branchId],
  );
  if (!active[0]) {
    return NextResponse.json({ error: "Sucursal inexistente" }, { status: 404 });
  }

  if (!context.isMaster) {
    const membership = await query<{ branch_id: string }>(
      "SELECT branch_id FROM user_branches WHERE user_id = $1 AND branch_id = $2",
      [context.user.userId, branchId],
    );
    if (!membership[0]) {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }
  }

  const token = await createSessionToken({
    userId: context.user.userId,
    activeBranchId: branchId,
  });

  const response = NextResponse.json({ ok: true, redirectTo: "/" });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
