import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, POST } from "@/app/api/payment-methods/route";
import { jsonRequest, makeUser, pgError, rawRequest } from "./_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const permissions = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => permissions);

const method = {
  id: "pm-1",
  code: "CASH",
  name: "Efectivo",
  is_active: true,
  sort_order: 1,
};

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser());
  permissions.hasPermission.mockResolvedValue(true);
  db.query.mockResolvedValue([]);
});

describe("GET /api/payment-methods", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without tariff.read", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "tariff.read");
  });

  it("lists the payment methods", async () => {
    db.query.mockResolvedValue([method]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ methods: [method] });
  });

  it("maps a database failure to a 400", async () => {
    db.query.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/payment-methods", () => {
  const url = "http://localhost/api/payment-methods";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await POST(jsonRequest(url, "POST", { code: "CASH", name: "Efectivo" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await POST(jsonRequest(url, "POST", { code: "CASH", name: "Efectivo" }));

    expect(res.status).toBe(403);
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "tariff.manage");
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects a missing code or name", async () => {
    const res = await POST(jsonRequest(url, "POST", { code: "  ", name: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Código (hasta 20) y nombre (hasta 40) requeridos",
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects a code longer than 20 characters", async () => {
    const res = await POST(
      jsonRequest(url, "POST", { code: "A".repeat(21), name: "Efectivo" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Código (hasta 20) y nombre (hasta 40) requeridos",
    });
  });

  it("creates the method with an upper-cased code and audits it", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO payment_methods")) return [method];
      return [];
    });

    const res = await POST(
      jsonRequest(url, "POST", { code: " cash ", name: " Efectivo " }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, method });
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payment_methods"),
    );
    expect(insert?.[1]).toEqual(["CASH", "Efectivo"]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'payment_method.create'")),
    ).toBe(true);
  });

  it("returns 409 on a duplicated code or name", async () => {
    db.query.mockRejectedValue(pgError("23505"));

    const res = await POST(jsonRequest(url, "POST", { code: "CASH", name: "Efectivo" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya existe un medio con ese código o nombre" });
  });
});

describe("PATCH /api/payment-methods", () => {
  const url = "http://localhost/api/payment-methods";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "pm-1" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "pm-1" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires the method id", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Efectivo" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el medio de pago" });
  });

  it("returns 404 when the method does not exist", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "pm-1" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Medio de pago inexistente" });
  });

  it("updates the name and active flag", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE payment_methods")) return [method];
      return [];
    });

    const res = await PATCH(
      jsonRequest(url, "PATCH", { id: "pm-1", name: " Efectivo ", isActive: false }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, method });
    const update = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE payment_methods"),
    );
    expect(update?.[1]).toEqual(["pm-1", "Efectivo", false]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'payment_method.update'")),
    ).toBe(true);
  });
});
