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
  // Red de seguridad: si el actor ya no existe en la base (cookie de otro
  // ambiente o usuario borrado), el mensaje de FK no le dice nada al usuario.
  // Solo se mapean las FK que apuntan al actor; el resto sigue siendo 400.
  const ACTOR_FK =
    /violates foreign key constraint "(vehicles_created_by_fkey|parking_sessions_opened_by_fkey|payments_registered_by_fkey|cash_shifts_opened_by_fkey|audit_logs_actor_id_fkey)"/;
  if (ACTOR_FK.test(message)) {
    return NextResponse.json(
      { error: "Tu sesión ya no es válida. Volvé a iniciar sesión." },
      { status: 401 },
    );
  }
  return NextResponse.json({ error: message }, { status: 400 });
}
