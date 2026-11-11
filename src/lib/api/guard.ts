import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * Guard de API: toda ruta mutante exige sesión válida (cookie httpOnly).
 * Devuelve el usuario o una respuesta 401 lista para retornar.
 */
export async function requireUser(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Sesión requerida" }, { status: 401 }),
    };
  }
  return { user, error: null };
}

/** Convierte un error de RPC en respuesta 400 con mensaje en español. */
export function rpcErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Error interno";
  return NextResponse.json({ error: message }, { status: 400 });
}
