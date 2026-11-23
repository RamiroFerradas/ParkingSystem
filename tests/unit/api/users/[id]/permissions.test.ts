import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "@/app/api/users/[id]/permissions/route";
import { fakeClient, jsonRequest, makeUser, rawRequest } from "../../_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const permissions = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  loadPermissionMatrix: vi.fn(),
  loadUserPermissionOverrides: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", () => permissions);

const nav = vi.hoisted(() => ({
  configurableSections: vi.fn(() => [
    { permission: "tariff.manage", label: "Tarifas", group: "Configuración" },
    { permission: "user.manage", label: "Usuarios", group: "Configuración" },
    { permission: "audit.read", label: "Auditoría", group: "Administración" },
  ]),
}));
vi.mock("@/components/shell/nav-config", () => nav);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser({ userId: "user-1" }));
  permissions.hasPermission.mockResolvedValue(true);
  permissions.loadPermissionMatrix.mockResolvedValue(new Map());
  permissions.loadUserPermissionOverrides.mockResolvedValue(new Map());
  db.query.mockResolvedValue([]);
});

describe("GET /api/users/[id]/permissions", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without user.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "No tenés permiso para administrar accesos",
    });
  });

  it("requires an active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Seleccioná una sucursal" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    db.query.mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/users/ghost/permissions"),
      params("ghost"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Usuario inexistente" });
  });

  it("hides a user outside the active branch from a non-master", async () => {
    db.query.mockResolvedValue([
      { id: "user-2", role: "employee", is_active: true, in_branch: false },
    ]);

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Usuario inexistente" });
  });

  it("lets a master read a user outside the active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ isMaster: true }));
    db.query.mockResolvedValue([
      { id: "user-2", role: "employee", is_active: true, in_branch: false },
    ]);

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(200);
  });

  it("returns inherited values, overrides and the effective value per section", async () => {
    db.query.mockResolvedValue([
      { id: "user-2", role: "employee", is_active: true, in_branch: true },
    ]);
    permissions.loadPermissionMatrix.mockResolvedValue(
      new Map([["employee:tariff.manage", true]]),
    );
    permissions.loadUserPermissionOverrides.mockResolvedValue(
      new Map([["audit.read", true]]),
    );

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: "user-2", role: "employee", isActive: true },
      permissions: [
        {
          permission: "tariff.manage",
          label: "Tarifas",
          group: "Configuración",
          roleAllowed: true,
          override: null,
          effective: true,
        },
        {
          permission: "user.manage",
          label: "Usuarios",
          group: "Configuración",
          roleAllowed: false,
          override: null,
          effective: false,
        },
        {
          permission: "audit.read",
          label: "Auditoría",
          group: "Administración",
          roleAllowed: false,
          override: true,
          effective: true,
        },
      ],
    });
    expect(permissions.loadUserPermissionOverrides).toHaveBeenCalledWith("user-2", "branch-1");
  });

  it("maps a database failure to a 400", async () => {
    db.query.mockRejectedValue(new Error("boom"));

    const res = await GET(
      new Request("http://localhost/api/users/user-2/permissions"),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("PUT /api/users/[id]/permissions", () => {
  const url = "http://localhost/api/users/user-2/permissions";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PUT(jsonRequest(url, "PUT", { overrides: [] }), params("user-2"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without user.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PUT(jsonRequest(url, "PUT", { overrides: [] }), params("user-2"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "No tenés permiso para administrar accesos",
    });
  });

  it("requires an active branch before reading the body", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await PUT(rawRequest(url, "PUT", "{"), params("user-2"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Seleccioná una sucursal" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PUT(rawRequest(url, "PUT", "{"), params("user-2"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires overrides to be an array", async () => {
    const res = await PUT(jsonRequest(url, "PUT", { overrides: "nope" }), params("user-2"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects an unknown permission in the payload", async () => {
    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "root.everything", allowed: true }] }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Permiso inválido: root.everything" });
  });

  it("rejects a non-boolean allowed value", async () => {
    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "audit.read", allowed: "yes" }] }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Valor de permiso inválido" });
  });

  it("returns 404 when the target user does not exist", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("FROM profiles")) return { rows: [] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "audit.read", allowed: true }] }),
      params("ghost"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Usuario inexistente" });
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("blocks removing your own user.manage permission", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("COALESCE(ub.role")) {
        return { rows: [{ id: "user-1", role: "admin", is_active: true, in_branch: true }] };
      }
      if (sql.includes("FROM role_permissions")) {
        return { rows: [{ role: "admin", permission: "*", allowed: true }] };
      }
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "user.manage", allowed: false }] }),
      params("user-1"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No podés quitarte el permiso de administrar usuarios a vos mismo",
    });
  });

  it("blocks leaving the system without an active user manager", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("up.allowed")) return { rows: [] };
      if (sql.includes("COALESCE(ub.role")) {
        return { rows: [{ id: "user-2", role: "employee", is_active: true, in_branch: true }] };
      }
      if (sql.includes("FROM role_permissions")) {
        return { rows: [{ role: "employee", permission: "user.manage", allowed: true }] };
      }
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "user.manage", allowed: false }] }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No podés dejar el sistema sin un usuario activo que administre usuarios",
    });
  });

  it("upserts overrides, audits the before/after state and commits", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("COALESCE(ub.role")) {
        return { rows: [{ id: "user-2", role: "employee", is_active: true, in_branch: true }] };
      }
      if (sql.includes("FROM role_permissions")) {
        return { rows: [{ role: "employee", permission: "tariff.manage", allowed: true }] };
      }
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await PUT(
      jsonRequest(url, "PUT", {
        overrides: [
          { permission: "tariff.manage", allowed: false },
          { permission: "audit.read", allowed: true },
        ],
      }),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      overrides: { "tariff.manage": false, "audit.read": true },
    });
    const upserts = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO user_permissions"),
    );
    expect(upserts).toHaveLength(2);
    expect(upserts[0]?.[1]).toEqual(["user-2", "branch-1", "tariff.manage", false, "user-1"]);
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toContain("COMMIT");
    const audit = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("'user.permissions'"),
    );
    expect(audit?.[1]).toEqual([
      "user-1",
      "branch-1",
      "user-2",
      JSON.stringify({ "tariff.manage": null, "audit.read": null }),
      JSON.stringify({ "tariff.manage": false, "audit.read": true }),
    ]);
  });

  it("deletes the override when allowed is null", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("COALESCE(ub.role")) {
        return { rows: [{ id: "user-2", role: "employee", is_active: true, in_branch: true }] };
      }
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "audit.read", allowed: null }] }),
      params("user-2"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, overrides: {} });
    const deletes = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("DELETE FROM user_permissions"),
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.[1]).toEqual(["user-2", "branch-1", "audit.read"]);
  });

  it("rolls back and maps a database failure to a 400", async () => {
    const client = fakeClient(() => {
      throw new Error("ledger locked");
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await PUT(
      jsonRequest(url, "PUT", { overrides: [{ permission: "audit.read", allowed: true }] }),
      params("user-2"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ledger locked" });
    expect(client.release).toHaveBeenCalledOnce();
  });
});
