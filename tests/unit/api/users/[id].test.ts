import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/users/[id]/route";
import { jsonRequest, makeUser, rawRequest } from "../_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const permissions = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => permissions);

const argon = vi.hoisted(() => ({ hash: vi.fn(), verify: vi.fn() }));
vi.mock("@node-rs/argon2", () => argon);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const target = { id: "user-2", role: "employee", is_active: true };

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser({ userId: "user-1" }));
  permissions.hasPermission.mockResolvedValue(true);
  argon.hash.mockResolvedValue("$argon2id$reset");
  db.query.mockResolvedValue([]);
});

describe("PATCH /api/users/[id]", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { isActive: false }),
      params("user-2"),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without user.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { isActive: false }),
      params("user-2"),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "No tenés permiso para administrar usuarios",
    });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(
      rawRequest("http://localhost/api/users/user-2", "PATCH", "{"),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects a password outside 8..72 characters", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { password: "short" }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La contraseña debe tener entre 8 y 72 caracteres",
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { role: "owner" }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Rol inválido" });
  });

  it("returns 404 when the target user does not exist", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/ghost", "PATCH", { isActive: false }),
      params("ghost"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Usuario inexistente" });
  });

  it("blocks deactivating your own account", async () => {
    db.query.mockResolvedValue([{ id: "user-1", role: "admin", is_active: true }]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-1", "PATCH", { isActive: false }),
      params("user-1"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No podés desactivarte o quitarte el rol a vos mismo",
    });
  });

  it("blocks downgrading your own role", async () => {
    db.query.mockResolvedValue([{ id: "user-1", role: "admin", is_active: true }]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-1", "PATCH", { role: "employee" }),
      params("user-1"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No podés desactivarte o quitarte el rol a vos mismo",
    });
  });

  it("blocks leaving the system without an active admin", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return [{ n: 0 }];
      if (sql.includes("FROM profiles")) {
        return [{ id: "user-2", role: "admin", is_active: true }];
      }
      return [];
    });

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { isActive: false }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No podés dejar el sistema sin un administrador activo",
    });
  });

  it("allows deactivating an admin while another active admin remains", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return [{ n: 2 }];
      if (sql.includes("FROM profiles")) {
        return [{ id: "user-2", role: "admin", is_active: true }];
      }
      if (sql.includes("UPDATE profiles SET is_active")) {
        return [{ id: "user-2", is_active: false }];
      }
      return [];
    });

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { isActive: false }),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE profiles SET is_active")),
    ).toBe(true);
  });

  it("updates only the active branch membership and audits it", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) {
        return [{ ...target, branch_role: "employee", admin_anywhere: false }];
      }
      return [];
    });

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { role: "supervisor" }),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const roleUpdate = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE user_branches SET role"),
    );
    expect(roleUpdate?.[1]).toEqual(["user-2", "branch-1", "supervisor"]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE profiles SET role")),
    ).toBe(false);
    const audit = db.query.mock.calls.find(([sql]) => String(sql).includes("'user.update'"));
    expect(audit).toBeTruthy();
    expect(audit?.[1]).toEqual(["user-1", "branch-1", "user-2", null, "supervisor", false]);
  });

  it("hides a user outside the active branch from a non-master", async () => {
    db.query.mockResolvedValue([
      { id: "user-2", role: "employee", is_active: true, branch_role: null, admin_anywhere: false },
    ]);

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { role: "supervisor" }),
      params("user-2"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Usuario inexistente" });
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE user_branches")),
    ).toBe(false);
  });

  it("lets a master change the role in a specific branch", async () => {
    const otherBranch = "22222222-2222-2222-2222-222222222222";
    session.getSessionUser.mockResolvedValue(makeUser({ userId: "user-1", isMaster: true }));
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) {
        return [
          {
            id: "user-2",
            role: "employee",
            is_active: true,
            branch_role: "employee",
            admin_anywhere: false,
          },
        ];
      }
      return [];
    });

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", {
        role: "supervisor",
        branchId: otherBranch,
      }),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    const roleUpdate = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE user_branches SET role"),
    );
    expect(roleUpdate?.[1]).toEqual(["user-2", otherBranch, "supervisor"]);
    const audit = db.query.mock.calls.find(([sql]) => String(sql).includes("'user.update'"));
    expect(audit?.[1]).toEqual(["user-1", otherBranch, "user-2", null, "supervisor", false]);
  });

  it("rejects a branchId from a non-master", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", {
        role: "supervisor",
        branchId: "22222222-2222-2222-2222-222222222222",
      }),
      params("user-2"),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Solo el administrador global puede elegir la sucursal",
    });
  });

  it("rejects an invalid branchId", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", {
        role: "supervisor",
        branchId: "nope",
      }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Sucursal inválida" });
  });

  it("resets the password through an upsert", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM profiles")) return [target];
      return [];
    });

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { password: "newsecret1" }),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    expect(argon.hash).toHaveBeenCalledWith("newsecret1");
    const upsert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO auth_credentials"),
    );
    expect(upsert?.[1]).toEqual(["user-2", "$argon2id$reset"]);
  });

  it("maps a database failure to a 400", async () => {
    db.query.mockRejectedValue(new Error("boom"));

    const res = await PATCH(
      jsonRequest("http://localhost/api/users/user-2", "PATCH", { isActive: true }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
