import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/switch-branch/route";
import { jsonRequest, makeContext, makeUser, rawRequest } from "../_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const authContext = vi.hoisted(() => ({ getBranchContext: vi.fn() }));
vi.mock("@/lib/auth/context", () => authContext);

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

beforeEach(() => {
  session.createSessionToken.mockResolvedValue("new-token");
  db.query.mockResolvedValue([]);
});

describe("POST /api/auth/switch-branch", () => {
  it("returns 401 when there is no session", async () => {
    authContext.getBranchContext.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/switch-branch", "POST", {
        branchId: "branch-1",
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects a body that is not valid JSON", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());

    const res = await POST(
      rawRequest("http://localhost/api/auth/switch-branch", "POST", "{"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires a branchId in the body", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());

    const res = await POST(
      jsonRequest("http://localhost/api/auth/switch-branch", "POST", {}),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Sucursal requerida" });
  });

  it("returns 404 when the branch does not exist or is inactive", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());
    db.query.mockResolvedValue([]);

    const res = await POST(
      jsonRequest("http://localhost/api/auth/switch-branch", "POST", {
        branchId: "missing",
      }),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Sucursal inexistente" });
    expect(session.createSessionToken).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-master is not a member of the branch", async () => {
    authContext.getBranchContext.mockResolvedValue(
      makeContext({ user: makeUser({ isMaster: false }) }),
    );
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM branches")) return [{ id: "branch-2" }];
      if (sql.includes("FROM user_branches")) return [];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/switch-branch", "POST", {
        branchId: "branch-2",
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso restringido" });
    expect(session.createSessionToken).not.toHaveBeenCalled();
  });

  it("reissues the cookie for a member switching to their branch", async () => {
    authContext.getBranchContext.mockResolvedValue(
      makeContext({ user: makeUser({ userId: "user-7", isMaster: false }) }),
    );
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM branches")) return [{ id: "branch-2" }];
      if (sql.includes("FROM user_branches")) return [{ branch_id: "branch-2" }];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/switch-branch", "POST", {
        branchId: "branch-2",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirectTo: "/" });
    expect(session.createSessionToken).toHaveBeenCalledWith({
      userId: "user-7",
      activeBranchId: "branch-2",
    });
    expect(res.headers.get("set-cookie")).toContain("parking_session=new-token");
  });

  it("lets a master switch to any active branch without a membership check", async () => {
    authContext.getBranchContext.mockResolvedValue(
      makeContext({ user: makeUser({ userId: "master-1", isMaster: true }) }),
    );
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM branches")) return [{ id: "branch-3" }];
      return [];
    });

    const res = await POST(
      jsonRequest("http://localhost/api/auth/switch-branch", "POST", {
        branchId: "branch-3",
      }),
    );

    expect(res.status).toBe(200);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("FROM user_branches")),
    ).toBe(false);
    expect(session.createSessionToken).toHaveBeenCalledWith({
      userId: "master-1",
      activeBranchId: "branch-3",
    });
  });
});
