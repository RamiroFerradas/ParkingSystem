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
  /** Role in effect for `branchId`. A master resolves to "admin". */
  role: UserRole;
  /** Active branch. null for a master outside a branch, or a stale membership. */
  branchId: string | null;
  branchName: string | null;
  isMaster: boolean;
}

/** What the signed cookie carries. Role is NEVER trusted from here. */
export interface TokenIdentity {
  userId: string;
  activeBranchId: string | null;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  identity: TokenIdentity,
): Promise<string> {
  return new SignJWT({ activeBranchId: identity.activeBranchId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<TokenIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      activeBranchId:
        typeof payload.activeBranchId === "string" ? payload.activeBranchId : null,
    };
  } catch {
    return null;
  }
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  is_master: boolean;
}

/**
 * El token es stateless: la firma puede ser válida aunque el usuario ya no
 * exista, esté desactivado o haya perdido la membresía a la sucursal. Por eso
 * el rol, la sucursal y el estado se leen siempre de la base; el token solo
 * aporta `userId` y `activeBranchId`.
 */
const loadActiveUser = cache(
  async (userId: string, branchId: string | null): Promise<SessionUser | null> => {
    try {
      const rows = await query<ProfileRow>(
        `SELECT id, email, full_name, role, is_active, is_master
           FROM profiles WHERE id = $1`,
        [userId],
      );
      const row = rows[0];
      if (!row || !row.is_active) return null;

      if (row.is_master) {
        let resolved: string | null = null;
        let branchName: string | null = null;
        if (branchId) {
          const branch = await query<{ name: string }>(
            "SELECT name FROM branches WHERE id = $1 AND is_active = true",
            [branchId],
          );
          if (branch[0]) {
            resolved = branchId;
            branchName = branch[0].name;
          }
        }
        return {
          userId: row.id,
          email: row.email,
          name: row.full_name,
          role: "admin",
          branchId: resolved,
          branchName,
          isMaster: true,
        };
      }

      if (branchId) {
        const membership = await query<{ role: UserRole; name: string }>(
          `SELECT ub.role, b.name
             FROM user_branches ub
             JOIN branches b ON b.id = ub.branch_id AND b.is_active = true
            WHERE ub.user_id = $1 AND ub.branch_id = $2`,
          [userId, branchId],
        );
        const m = membership[0];
        if (m) {
          return {
            userId: row.id,
            email: row.email,
            name: row.full_name,
            role: m.role,
            branchId,
            branchName: m.name,
            isMaster: false,
          };
        }
      }

      // No branch selected, or a stale membership: the layout routes to the
      // branch selector. The legacy profile role is kept only as a fallback so
      // permission checks fail closed instead of throwing.
      return {
        userId: row.id,
        email: row.email,
        name: row.full_name,
        role: row.role,
        branchId: null,
        branchName: null,
        isMaster: false,
      };
    } catch {
      // Fail closed: ante un error de base tratamos la sesión como inválida.
      return null;
    }
  },
);

/** Lee la sesión desde la cookie httpOnly y la revalida contra la base. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const identity = await verifySessionToken(token);
  if (!identity) return null;
  return loadActiveUser(identity.userId, identity.activeBranchId);
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
