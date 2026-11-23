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
    // A1: the audit insert now runs inside the same transaction as the profile
    // and the credentials, so COMMIT is the last statement again.
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO profiles"),
      expect.stringContaining("INSERT INTO auth_credentials"),
      expect.stringContaining("INSERT INTO user_branches"),
      expect.stringContaining("INSERT INTO audit_logs"),
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
    const profileInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO profiles"),
    );
    expect(profileInsert?.[1]).toEqual(["nuevo@example.com", "Nuevo Empleado", "employee"]);
    // El alta deja al usuario operable en la sucursal del administrador: sin
    // membresía el login termina en /seleccionar-sucursal.
    const branchInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO user_branches"),
    );
    expect(branchInsert?.[1]).toEqual(["new-user", "branch-1", "employee"]);
    const auditInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audit_logs"),
    );
    expect(auditInsert?.[1]).toEqual(["user-1", "new-user", "nuevo@example.com", "employee"]);
    expect(db.query).not.toHaveBeenCalled();
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

  it("maps a stale actor foreign key to a 401 and rolls the whole create back", async () => {
    // A1: the audit insert must share the transaction, otherwise a stale actor
    // leaves the profile + credentials committed and the client gets a 401.
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO profiles")) return { rows: [created] };
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error('violates foreign key constraint "audit_logs_actor_id_fkey"');
      }
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest("http://localhost/api/users", "POST", payload));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Tu sesión ya no es válida. Volvé a iniciar sesión.",
    });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
