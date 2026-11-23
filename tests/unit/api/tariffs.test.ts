import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, POST } from "@/app/api/tariffs/route";
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

const tariff = {
  id: "t-1",
  kind: "hourly",
  code: null,
  name: "Auto 2 h",
  description: null,
  vehicle_type_id: "vt-1",
  vehicle_type_name: "Auto",
  duration_minutes: 120,
  duration_mode: "flat",
  amount_cents: "500000",
  is_active: true,
  valid_from: "2026-01-01T00:00:00Z",
  valid_to: null,
  valid_from_local: "2025-12-31T21:00",
  valid_to_local: null,
};

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser());
  permissions.hasPermission.mockResolvedValue(true);
  db.query.mockResolvedValue([]);
});

describe("GET /api/tariffs", () => {
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

  it("returns 400 when the user has no active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await GET();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Elegí una sucursal para gestionar tarifas",
    });
  });

  it("lists the branch tariffs", async () => {
    db.query.mockResolvedValue([tariff]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tariffs: [tariff] });
    expect(db.query.mock.calls[0]?.[1]).toEqual(["branch-1"]);
  });
});

describe("POST /api/tariffs", () => {
  const url = "http://localhost/api/tariffs";
  const base = {
    vehicleTypeId: "vt-1",
    durationMinutes: 120,
    amountCents: 500_000,
  };

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await POST(jsonRequest(url, "POST", base));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await POST(jsonRequest(url, "POST", base));

    expect(res.status).toBe(403);
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "tariff.manage");
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("returns 400 when the user has no active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await POST(jsonRequest(url, "POST", base));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Elegí una sucursal para gestionar tarifas",
    });
  });

  it("rejects an invalid validFrom", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, validFrom: "nope" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Fecha de inicio inválida" });
  });

  it("rejects an invalid validTo", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, validTo: "nope" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Fecha de fin inválida" });
  });

  it("requires a vehicle type", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, vehicleTypeId: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el tipo de vehículo" });
  });

  it("rejects a code longer than 20 characters", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, code: "x".repeat(21) }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Código demasiado largo" });
  });

  it("rejects a non-integer duration for an hourly tariff", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, durationMinutes: 1.5 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La duración debe ser un entero positivo (minutos)",
    });
  });

  it("rejects a negative amount", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, amountCents: -1 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Monto inválido (centavos)" });
  });

  it("rejects a validity window that ends before it starts", async () => {
    const res = await POST(
      jsonRequest(url, "POST", {
        ...base,
        validFrom: "2026-05-01T00:00:00Z",
        validTo: "2026-04-01T00:00:00Z",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La vigencia debe terminar después de empezar",
    });
  });

  it("rejects an unknown or inactive vehicle type", async () => {
    db.query.mockResolvedValue([]);

    const res = await POST(jsonRequest(url, "POST", base));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El tipo de vehículo indicado no existe" });
  });

  it("creates an hourly tariff with a generated name", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM vehicle_types")) return [{ name: "Auto" }];
      if (sql.includes("INSERT INTO parking_tariffs")) return [{ id: "t-9" }];
      return [];
    });

    const res = await POST(jsonRequest(url, "POST", base));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: "t-9" });
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO parking_tariffs"),
    );
    expect(insert?.[1]?.[0]).toBe("branch-1");
    expect(insert?.[1]?.[1]).toBe("hourly");
    expect(insert?.[1]?.[3]).toBe("Auto 2 h");
    expect(insert?.[1]?.[6]).toBe(120);
    expect(insert?.[1]?.[7]).toBe(500_000);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'tariff.create'")),
    ).toBe(true);
  });

  it("creates a monthly plan without a duration", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM vehicle_types")) return [{ name: "Auto" }];
      if (sql.includes("INSERT INTO parking_tariffs")) return [{ id: "t-10" }];
      return [];
    });

    const res = await POST(
      jsonRequest(url, "POST", {
        vehicleTypeId: "vt-1",
        amountCents: 9_000_000,
        kind: "monthly",
      }),
    );

    expect(res.status).toBe(201);
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO parking_tariffs"),
    );
    expect(insert?.[1]?.[1]).toBe("monthly");
    expect(insert?.[1]?.[3]).toBe("Auto abono mensual");
    expect(insert?.[1]?.[6]).toBeNull();
  });

  it("returns 409 on a duplicated code", async () => {
    db.query.mockRejectedValue(pgError("23505"));

    const res = await POST(jsonRequest(url, "POST", { ...base, code: "AUTO120" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya existe una tarifa con ese código" });
  });

  it("maps a foreign key violation to a 400 about the vehicle type", async () => {
    db.query.mockRejectedValue(pgError("23503"));

    const res = await POST(jsonRequest(url, "POST", base));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El tipo de vehículo indicado no existe" });
  });
});

describe("PATCH /api/tariffs", () => {
  const url = "http://localhost/api/tariffs";
  const current = {
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: null,
    branch_id: "branch-1",
  };

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires the tariff id", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { amountCents: 100 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta la tarifa" });
  });

  it("rejects an invalid amount", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1", amountCents: 1.5 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Monto inválido (centavos)" });
  });

  it("rejects an explicitly empty validFrom", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1", validFrom: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Fecha de inicio inválida" });
  });

  it("returns 400 when the user has no active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1", amountCents: 100 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Elegí una sucursal para gestionar tarifas",
    });
  });

  it("returns 404 when the tariff belongs to another branch", async () => {
    db.query.mockResolvedValue([{ ...current, branch_id: "branch-2" }]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1", amountCents: 100 }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tarifa inexistente" });
  });

  it("rejects a window that ends before the stored start", async () => {
    db.query.mockResolvedValue([current]);

    const res = await PATCH(
      jsonRequest(url, "PATCH", { id: "t-1", validTo: "2025-12-01T00:00:00Z" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La vigencia debe terminar después de empezar",
    });
  });

  it("rejects a request with nothing to update", async () => {
    db.query.mockResolvedValue([current]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nada para actualizar" });
  });

  it("updates the amount and active flag", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT valid_from")) return [current];
      if (sql.includes("UPDATE parking_tariffs")) return [{ id: "t-1" }];
      return [];
    });

    const res = await PATCH(
      jsonRequest(url, "PATCH", { id: "t-1", amountCents: 750_000, isActive: false }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const update = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE parking_tariffs"),
    );
    expect(String(update?.[0])).toContain("amount_cents = $1");
    expect(String(update?.[0])).toContain("is_active = $2");
    expect(update?.[1]).toEqual([750_000, false, "t-1", "branch-1"]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'tariff.update'")),
    ).toBe(true);
  });

  it("clears validTo when it is sent as null", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT valid_from")) {
        return [{ ...current, valid_to: "2026-12-31T00:00:00Z" }];
      }
      if (sql.includes("UPDATE parking_tariffs")) return [{ id: "t-1" }];
      return [];
    });

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1", validTo: null }));

    expect(res.status).toBe(200);
    const update = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE parking_tariffs"),
    );
    expect(update?.[1]?.[0]).toBeNull();
  });

  it("returns 404 when the update matches no row", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT valid_from")) return [current];
      if (sql.includes("UPDATE parking_tariffs")) return [];
      return [];
    });

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "t-1", amountCents: 100 }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tarifa inexistente" });
  });
});
