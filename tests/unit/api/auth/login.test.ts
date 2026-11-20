import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/login/route";
import { jsonRequest, rawRequest } from "../_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const argon = vi.hoisted(() => ({ verify: vi.fn(), hash: vi.fn() }));
vi.mock("@node-rs/argon2", () => argon);

const session = vi.hoisted(() => ({
  SESSION_COOKIE: "parking_session",
  SESSION_MAX_AGE_SECONDS: 43_200,
  createSessionToken: vi.fn(),
  sessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 43_200,
  })),
}));
vi.mock("@/lib/auth/session", () => session);

const LOGIN_ROW = {
  id: "user-1",
  full_name: "Ana Pérez",
  email: "ana@example.com",
  role: "admin",
  is_master: false,
  password_hash: "$argon2id$hash",
};

beforeEach(() => {
  argon.verify.mockResolvedValue(true);
  session.createSessionToken.mockResolvedValue("signed-token");
  db.query.mockResolvedValue([]);
});

describe("POST /api/auth/login", () => {
  it("rejects a body that is not valid JSON with the generic message", async () => {
    const res = await POST(rawRequest("http://localhost/api/auth/login", "POST", "nope"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Credenciales inválidas" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects a payload without email or password", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", { email: "ana@example.com" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Credenciales inválidas" });
  });

  it("normalizes the email before querying", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [];
      return [];
    });

    await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "  ANA@Example.COM ",
        password: "secret123",
      }),
    );

    expect(db.query.mock.calls[0]?.[1]).toEqual(["ana@example.com"]);
  });

  it("returns 401 and records the failed attempt for an unknown user", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ghost@example.com",
        password: "secret123",
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Credenciales inválidas" });
    expect(argon.verify).not.toHaveBeenCalled();
    const auditCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("auth.login_failed"),
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall?.[1]).toEqual(["ghost@example.com", "ghost@example.com"]);
  });

  it("returns 401 for a wrong password and logs the attempt", async () => {
    argon.verify.mockResolvedValue(false);
    db.query.mockResolvedValueOnce([LOGIN_ROW]).mockResolvedValueOnce([]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ana@example.com",
        password: "wrong-password",
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Credenciales inválidas" });
    expect(session.createSessionToken).not.toHaveBeenCalled();
  });

  it("treats a throwing verifier as invalid credentials", async () => {
    argon.verify.mockRejectedValueOnce(new Error("bad hash"));
    db.query.mockResolvedValueOnce([LOGIN_ROW]).mockResolvedValueOnce([]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ana@example.com",
        password: "secret123",
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Credenciales inválidas" });
  });

  it("signs a session for a user with a single branch and redirects home", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [LOGIN_ROW];
      if (sql.includes("FROM user_branches")) return [{ branch_id: "branch-9" }];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ana@example.com",
        password: "secret123",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      user: { name: "Ana Pérez", role: "admin", isMaster: false },
      redirectTo: "/",
    });
    expect(session.createSessionToken).toHaveBeenCalledWith({
      userId: "user-1",
      activeBranchId: "branch-9",
    });
    expect(res.headers.get("set-cookie")).toContain("parking_session=signed-token");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("auth.login")),
    ).toBe(true);
  });

  it("sends a user with several branches to the branch selector", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [LOGIN_ROW];
      if (sql.includes("FROM user_branches")) {
        return [{ branch_id: "branch-1" }, { branch_id: "branch-2" }];
      }
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ana@example.com",
        password: "secret123",
      }),
    );

    expect(res.status).toBe(200);
    expect(((await res.json()) as { redirectTo: string }).redirectTo).toBe(
      "/seleccionar-sucursal",
    );
    expect(session.createSessionToken).toHaveBeenCalledWith({
      userId: "user-1",
      activeBranchId: null,
    });
  });

  it("sends a master to the branch selector without reading memberships", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [{ ...LOGIN_ROW, is_master: true }];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ana@example.com",
        password: "secret123",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      user: { name: "Ana Pérez", role: "admin", isMaster: true },
      redirectTo: "/seleccionar-sucursal",
    });
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("FROM user_branches")),
    ).toBe(false);
  });

  it("sends a user without active branches to the branch selector", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [LOGIN_ROW];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/login", "POST", {
        email: "ana@example.com",
        password: "secret123",
      }),
    );

    expect(((await res.json()) as { redirectTo: string }).redirectTo).toBe(
      "/seleccionar-sucursal",
    );
    expect(session.createSessionToken).toHaveBeenCalledWith({
      userId: "user-1",
      activeBranchId: null,
    });
  });
});
