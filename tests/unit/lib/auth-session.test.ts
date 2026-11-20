// @vitest-environment node
// jose validates keys with `instanceof Uint8Array`; jsdom runs in its own VM
// realm, so a TextEncoder from the node realm fails that check.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT, decodeJwt } from "jose";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

import { cookies } from "next/headers";
import { query } from "@/lib/db/client";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getSessionUser,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "unit-test-secret-unit-test-secret";
const OTHER_SECRET = "another-secret-another-secret";

function stubCookies(token?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      token !== undefined && name === SESSION_COOKIE ? { name, value: token } : undefined,
  } as never);
}

function stubQuery(...results: unknown[][]) {
  const q = vi.mocked(query);
  for (const rows of results) q.mockResolvedValueOnce(rows as never);
  return q;
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "op@parking.test",
    full_name: "Operador Uno",
    role: "employee",
    is_active: true,
    is_master: false,
    ...overrides,
  };
}

async function tokenFor(userId: string, activeBranchId: string | null) {
  return createSessionToken({ userId, activeBranchId });
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSessionToken / verifySessionToken", () => {
  it("signs an HS256 token with sub, branch claim and a 12h expiry", async () => {
    const token = await createSessionToken({ userId: "user-1", activeBranchId: "b-1" });
    const payload = decodeJwt(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.activeBranchId).toBe("b-1");
    expect(payload.exp! - payload.iat!).toBe(SESSION_MAX_AGE_SECONDS);
    expect(SESSION_MAX_AGE_SECONDS).toBe(12 * 60 * 60);
    // Protected header lives in the first base64url segment.
    const header = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
    expect(header.alg).toBe("HS256");
  });

  it("round-trips the identity", async () => {
    const token = await tokenFor("user-7", null);

    await expect(verifySessionToken(token)).resolves.toEqual({
      userId: "user-7",
      activeBranchId: null,
    });
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = await new SignJWT({ activeBranchId: "b-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .sign(new TextEncoder().encode(OTHER_SECRET));

    await expect(verifySessionToken(foreign)).resolves.toBeNull();
  });

  it("rejects a malformed token", async () => {
    await expect(verifySessionToken("not-a-jwt")).resolves.toBeNull();
  });

  it("rejects a valid signature that carries no sub", async () => {
    const token = await new SignJWT({ activeBranchId: "b-1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("drops a non-string activeBranchId claim", async () => {
    const token = await new SignJWT({ activeBranchId: 5 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(token)).resolves.toEqual({
      userId: "user-1",
      activeBranchId: null,
    });
  });

  it("throws when signing without AUTH_SECRET but verifies to null", async () => {
    vi.stubEnv("AUTH_SECRET", undefined);

    await expect(tokenFor("user-1", null)).rejects.toThrow(
      "AUTH_SECRET no está configurado",
    );
    await expect(verifySessionToken("whatever")).resolves.toBeNull();
  });
});

describe("getSessionUser", () => {
  it("returns null without the session cookie and never queries the database", async () => {
    stubCookies(undefined);

    await expect(getSessionUser()).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns null when the cookie is not a valid token", async () => {
    stubCookies("garbage");

    await expect(getSessionUser()).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns null when the profile is inactive", async () => {
    stubCookies(await tokenFor("user-1", null));
    stubQuery([profile({ is_active: false })]);

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("resolves a master to admin with the active branch name", async () => {
    stubCookies(await tokenFor("user-1", "b-1"));
    const q = stubQuery([profile({ is_master: true })], [{ name: "Centro" }]);

    await expect(getSessionUser()).resolves.toEqual({
      userId: "user-1",
      email: "op@parking.test",
      name: "Operador Uno",
      role: "admin",
      branchId: "b-1",
      branchName: "Centro",
      isMaster: true,
    });
    expect(q.mock.calls[1]![1]).toEqual(["b-1"]);
  });

  it("keeps a master outside a branch as a branchless admin", async () => {
    stubCookies(await tokenFor("user-1", null));
    const q = stubQuery([profile({ is_master: true })]);

    const user = await getSessionUser();

    expect(user).toMatchObject({ role: "admin", branchId: null, isMaster: true });
    expect(q).toHaveBeenCalledTimes(1);
  });

  it("ignores a master branch id that is not active", async () => {
    stubCookies(await tokenFor("user-1", "b-9"));
    stubQuery([profile({ is_master: true })], []);

    await expect(getSessionUser()).resolves.toMatchObject({
      branchId: null,
      branchName: null,
      isMaster: true,
    });
  });

  it("uses the branch membership role for a regular user", async () => {
    stubCookies(await tokenFor("user-1", "b-1"));
    stubQuery([profile()], [{ role: "supervisor", name: "Centro" }]);

    await expect(getSessionUser()).resolves.toEqual({
      userId: "user-1",
      email: "op@parking.test",
      name: "Operador Uno",
      role: "supervisor",
      branchId: "b-1",
      branchName: "Centro",
      isMaster: false,
    });
  });

  it("falls back to the legacy role with no branch on a stale membership", async () => {
    stubCookies(await tokenFor("user-1", "b-gone"));
    stubQuery([profile({ role: "supervisor" })], []);

    await expect(getSessionUser()).resolves.toMatchObject({
      role: "supervisor",
      branchId: null,
      branchName: null,
    });
  });

  it("fails closed when the database throws", async () => {
    stubCookies(await tokenFor("user-1", null));
    vi.mocked(query).mockRejectedValue(new Error("connection refused"));

    await expect(getSessionUser()).resolves.toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, lax, root-scoped and 12h long", () => {
    vi.stubEnv("DATA_PLANE", undefined);

    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 12 * 60 * 60,
    });
  });

  it("is secure on the cloud data plane", () => {
    vi.stubEnv("DATA_PLANE", "cloud");

    expect(sessionCookieOptions().secure).toBe(true);
  });
});
