import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/users/route";
import { fakeClient, jsonRequest, makeUser, pgError, rawRequest } from "./_support";

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

const created = {
  id: "new-user",
  full_name: "Nuevo Empleado",
  email: "nuevo@example.com",
  role: "employee",
  is_active: true,
  created_at: "2026-01-01 10:00:00+00",
};

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser());
  permissions.hasPermission.mockResolvedValue(true);
  argon.hash.mockResolvedValue("$argon2id$new");
  db.query.mockResolvedValue([]);
});

describe("GET /api/users", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 when the role cannot manage users", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "No tenés permiso para administrar usuarios",
    });
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "user.manage");
  });

  it("lists the users", async () => {
    db.query.mockResolvedValue([created]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [created] });
  });

  it("maps a database error to a 400 with the driver message", async () => {
    db.query.mockRejectedValue(new Error("relation does not exist"));

    const res = await GET();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "relation does not exist" });
  });
});

describe("POST /api/users", () => {
  const payload = {
    email: "Nuevo@Example.com",
    fullName: "  Nuevo Empleado ",
    role: "employee",
    password: "supersecret",
  };

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await POST(jsonRequest("http://localhost/api/users", "POST", payload));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without user.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await POST(jsonRequest("http://localhost/api/users", "POST", payload));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "No tenés permiso para administrar usuarios",
    });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest("http://localhost/api/users", "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects an invalid email", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/users", "POST", { ...payload, email: "nope" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Email inválido" });
  });

  it("rejects an empty name", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/users", "POST", { ...payload, fullName: "   " }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nombre inválido" });
  });

  it("rejects an unknown role", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/users", "POST", { ...payload, role: "owner" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Rol inválido" });
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/users", "POST", { ...payload, password: "short" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La contraseña debe tener entre 8 y 72 caracteres",
    });
  });

  it("creates the user, hashes the password and audits the action", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO profiles")) return { rows: [created] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest("http://localhost/api/users", "POST", payload));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, user: created });
    expect(argon.hash).toHaveBeenCalledWith("supersecret");
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO profiles"),
      expect.stringContaining("INSERT INTO auth_credentials"),
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
    const profileInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO profiles"),
    );
    expect(profileInsert?.[1]).toEqual(["nuevo@example.com", "Nuevo Empleado", "employee"]);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("'user.create'"))).toBe(true);
  });

  it("returns 409 on a unique email violation and rolls back", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO profiles")) throw pgError("23505");
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest("http://localhost/api/users", "POST", payload));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya existe un usuario con ese email" });
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("maps a stale actor foreign key to a 401 session error", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO profiles")) return { rows: [created] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);
    db.query.mockRejectedValue(
      new Error('violates foreign key constraint "audit_logs_actor_id_fkey"'),
    );

    const res = await POST(jsonRequest("http://localhost/api/users", "POST", payload));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Tu sesión ya no es válida. Volvé a iniciar sesión.",
    });
  });
});
