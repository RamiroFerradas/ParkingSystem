import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, POST } from "@/app/api/special-tariffs/route";
import { jsonRequest, makeUser, rawRequest } from "./_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const permissions = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => permissions);

const period = {
  id: "sp-1",
  name: "Fiestas",
  starts_at: "2026-12-20T00:00:00Z",
  ends_at: "2026-12-31T00:00:00Z",
  vehicle_type_ids: ["vt-1"],
  adjustment_type: "percent",
  adjustment_value: "20",
  priority: 100,
  status: "scheduled",
};

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser());
  permissions.hasPermission.mockResolvedValue(true);
  db.query.mockResolvedValue([]);
});

describe("GET /api/special-tariffs", () => {
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

  it("lists the special periods", async () => {
    db.query.mockResolvedValue([period]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ specials: [period] });
  });
});

describe("POST /api/special-tariffs", () => {
  const url = "http://localhost/api/special-tariffs";
  const base = {
    name: "Fiestas",
    startsAt: "2026-12-20T00:00:00Z",
    endsAt: "2026-12-31T00:00:00Z",
    adjustmentType: "percent",
    adjustmentValue: 20,
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
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "tariff.manage");
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects an empty name", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, name: "   " }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nombre inválido" });
  });

  it("rejects a period that ends before it starts", async () => {
    const res = await POST(
      jsonRequest(url, "POST", { ...base, endsAt: "2026-12-01T00:00:00Z" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El fin del período debe ser posterior al inicio",
    });
  });

  it("rejects an unparsable date", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, startsAt: "nope" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El fin del período debe ser posterior al inicio",
    });
  });

  it("rejects an unknown adjustment type", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...base, adjustmentType: "multiplier" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tipo de ajuste inválido" });
  });

  it("rejects a percentage outside 1..100", async () => {
    const zero = await POST(jsonRequest(url, "POST", { ...base, adjustmentValue: 0 }));
    const tooBig = await POST(jsonRequest(url, "POST", { ...base, adjustmentValue: 101 }));

    expect(zero.status).toBe(400);
    expect(await zero.json()).toEqual({ error: "El porcentaje debe estar entre 1 y 100" });
    expect(tooBig.status).toBe(400);
  });

  it("rejects a non-integer fixed surcharge", async () => {
    const res = await POST(
      jsonRequest(url, "POST", {
        ...base,
        adjustmentType: "fixed_amount",
        adjustmentValue: 10.5,
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El recargo fijo debe ser un entero positivo (centavos)",
    });
  });

  it("creates a percentage period and audits it", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO special_tariff_periods")) return [{ id: "sp-9" }];
      return [];
    });

    const res = await POST(
      jsonRequest(url, "POST", { ...base, vehicleTypeIds: ["vt-1", 42], priority: 5.8 }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: "sp-9" });
    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO special_tariff_periods"),
    );
    expect(insert?.[1]?.[0]).toBe("Fiestas");
    expect(insert?.[1]?.[3]).toEqual(["vt-1"]);
    expect(insert?.[1]?.[4]).toBe("percent");
    expect(insert?.[1]?.[5]).toBe(20);
    expect(insert?.[1]?.[6]).toBe(5);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'special.create'")),
    ).toBe(true);
  });

  it("defaults the priority to 100", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO special_tariff_periods")) return [{ id: "sp-9" }];
      return [];
    });

    await POST(jsonRequest(url, "POST", base));

    const insert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO special_tariff_periods"),
    );
    expect(insert?.[1]?.[6]).toBe(100);
  });
});

describe("PATCH /api/special-tariffs", () => {
  const url = "http://localhost/api/special-tariffs";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sp-1", status: "cancelled" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sp-1", status: "cancelled" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("only accepts a cancellation request", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sp-1", status: "active" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Solo se puede cancelar un período" });
  });

  it("returns 404 when the period is gone or finished", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sp-1", status: "cancelled" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Período inexistente o ya finalizado" });
  });

  it("cancels a scheduled period and audits it", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE special_tariff_periods")) return [{ id: "sp-1" }];
      return [];
    });

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sp-1", status: "cancelled" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'special.cancel'")),
    ).toBe(true);
  });
});
