import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { query } from "@/lib/db/client";

export const SESSION_COOKIE = "parking_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // turno operativo de 12 h

export type UserRole = "admin" | "supervisor" | "employee";

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "admin" &&
        payload.role !== "supervisor" &&
        payload.role !== "employee")
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * El token es stateless: la firma puede ser válida aunque el usuario ya no
 * exista en la base actual (cookie emitida contra otro ambiente) o esté
 * desactivado. Por eso el rol y el estado se leen siempre de `profiles`;
 * el token solo aporta el id.
 */
const loadActiveUser = cache(async (userId: string): Promise<SessionUser | null> => {
  try {
    const rows = await query<{
      id: string;
      email: string;
      full_name: string;
      role: UserRole;
      is_active: boolean;
    }>(
      "SELECT id, email, full_name, role, is_active FROM profiles WHERE id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row || !row.is_active) return null;
    return {
      userId: row.id,
      email: row.email,
      name: row.full_name,
      role: row.role,
    };
  } catch {
    // Fail closed: ante un error de base tratamos la sesión como inválida.
    return null;
  }
});

/** Lee la sesión desde la cookie httpOnly y la revalida contra la base. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  return loadActiveUser(payload.userId);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.DATA_PLANE === "cloud",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
