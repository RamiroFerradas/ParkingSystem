import { vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import type { BranchContext } from "@/lib/auth/context";

/** Minimal fake of a `pg` PoolClient. Dispatch by SQL text; default is empty rows. */
export function fakeClient(
  handler?: (sql: string, params: unknown[]) => { rows: unknown[] } | undefined,
) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const result = handler?.(sql, params);
      return { rows: result?.rows ?? [] };
    }),
    release: vi.fn(),
  };
}

/** Postgres driver errors expose a `code`; the routes branch on 23505 / 23503. */
export function pgError(code: string, message = "pg error") {
  return Object.assign(new Error(message), { code });
}

export function jsonRequest(
  url: string,
  method: string,
  body: unknown = {},
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function rawRequest(url: string, method: string, body: string): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

export function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: "user-1",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    branchId: "branch-1",
    branchName: "Centro",
    isMaster: false,
    ...overrides,
  };
}

export function makeContext(
  overrides: Partial<BranchContext> = {},
): BranchContext {
  const user = overrides.user ?? makeUser();
  return {
    user,
    branchId: user.branchId,
    branchName: user.branchName,
    role: user.role,
    isMaster: user.isMaster,
    memberships: [],
    can: () => true,
    ...overrides,
  };
}
