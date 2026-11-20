import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, POST } from "@/app/api/vehicle-types/route";
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

const vehicleType = {
  id: "vt-1",
  code: "AUTO",
  name: "Auto",
  is_active: true,
  sort_order: 1,
};

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser());
  permissions.hasPermission.mockResolvedValue(true);
  db.query.mockResolvedValue([]);
});

describe("GET /api/vehicle-types", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without vehicle.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "vehicle.manage");
  });

  it("lists the vehicle types", async () => {
    db.query.mockResolvedValue([vehicleType]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ types: [vehicleType] });
  });

  it("maps a database failure to a 400", async () => {
    db.query.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/vehicle-types", () => {
  const url = "http://localhost/api/vehicle-types";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await POST(jsonRequest(url, "POST", { name: "Auto" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires vehicle.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await POST(jsonRequest(url, "POST", { name: "Auto" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires a name", async () => {
    const res = await POST(jsonRequest(url, "POST", { name: "   " }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nombre requerido (hasta 40 caracteres)" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("derives an upper-cased code from an accented name", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vehicle_types")) return [vehicleType];
      return [];
    });

    const res = await POST(
      jsonRequest(url, "POST", { name: "Camión Eléctrico", sortOrder: 3.9 }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, type: vehicleType });
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vehicle_types"),
    );
    expect(insert?.[1]).toEqual(["CAMION_ELECTRICO", "Camión Eléctrico", 3]);
  });

  it("upper-cases an explicit code instead of deriving one", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vehicle_types")) return [vehicleType];
      return [];
    });

    await POST(jsonRequest(url, "POST", { name: "Moto", code: " moto " }));

    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vehicle_types"),
    );
    expect(insert?.[1]?.[0]).toBe("MOTO");
  });

  it("rejects an explicit code longer than 20 characters", async () => {
    // Explicit codes are not truncated; the derived-code path is the one sliced to 20.
    // The message blames the name even when the code is the offending field.
    const res = await POST(
      jsonRequest(url, "POST", { name: "Moto", code: "m".repeat(21) }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nombre requerido (hasta 40 caracteres)" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 409 on a duplicated code or name", async () => {
    db.query.mockRejectedValue(pgError("23505"));

    const res = await POST(jsonRequest(url, "POST", { name: "Auto" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya existe un tipo con ese código o nombre" });
  });
});

describe("PATCH /api/vehicle-types", () => {
  const url = "http://localhost/api/vehicle-types";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "vt-1" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires vehicle.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "vt-1" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires the type id", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Auto" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el tipo" });
  });

  it("refuses to deactivate a type still used by vehicles", async () => {
    db.query.mockResolvedValueOnce([{ n: 2 }]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "vt-1", isActive: false }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Hay vehículos con este tipo; no se puede desactivar",
    });
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE vehicle_types")),
    ).toBe(false);
  });

  it("deactivates an unused type", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return [{ n: 0 }];
      if (sql.includes("UPDATE vehicle_types")) return [{ ...vehicleType, is_active: false }];
      return [];
    });

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "vt-1", isActive: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      type: { ...vehicleType, is_active: false },
    });
  });

  it("returns 404 when the type does not exist", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "vt-1", name: "Otro" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tipo inexistente" });
  });

  it("updates the name, order and active flag and audits it", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE vehicle_types")) return [vehicleType];
      return [];
    });

    const res = await PATCH(
      jsonRequest(url, "PATCH", { id: "vt-1", name: " Auto ", sortOrder: 2.7, isActive: true }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: vehicleType });
    const update = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE vehicle_types"),
    );
    expect(update?.[1]).toEqual(["vt-1", "Auto", 2, true]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'vehicle_type.update'")),
    ).toBe(true);
  });
});
