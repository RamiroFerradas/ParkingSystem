import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, POST } from "@/app/api/subscriptions/route";
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

const plan = {
  id: "t-1",
  amount_cents: "900000",
  vehicle_type_id: "vt-1",
  vehicle_type_name: "Auto",
  name: "Auto abono mensual",
};

const subscription = {
  id: "sub-1",
  plate: "AB123CD",
  vehicle_type: "Auto",
  plan_name: "Auto abono mensual",
  starts_on: "2026-01-01",
  ends_on: "2026-01-31",
  amount_cents: "900000",
  status: "active",
  vigente: true,
  created_by_name: "Admin",
  created_at: "2026-01-01 10:00:00+00",
  notes: null,
};

const payload = {
  plate: "ab-123cd",
  tariffId: "t-1",
  startsOn: "2026-01-01",
  endsOn: "2026-01-31",
  methodId: "pm-1",
};

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser({ userId: "user-1" }));
  permissions.hasPermission.mockResolvedValue(true);
  db.query.mockResolvedValue([]);
});

describe("GET /api/subscriptions", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "tariff.manage");
  });

  it("returns 400 when the user has no active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await GET();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Elegí una sucursal" });
  });

  it("lists the branch subscriptions", async () => {
    db.query.mockResolvedValue([subscription]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscriptions: [subscription] });
    expect(db.query.mock.calls[0]?.[1]).toEqual(["branch-1"]);
  });
});

describe("POST /api/subscriptions", () => {
  const url = "http://localhost/api/subscriptions";

  const handler = (overrides: {
    shift?: unknown[];
    vehicles?: unknown[];
    overlap?: unknown[];
    today?: string;
  } = {}) =>
    fakeClient((sql) => {
      if (sql.includes("FROM cash_shifts")) return { rows: overrides.shift ?? [{ id: "shift-1" }] };
      if (sql.includes("FROM vehicles WHERE plate")) return { rows: overrides.vehicles ?? [] };
      if (sql.includes("INSERT INTO vehicles")) return { rows: [{ id: "veh-new" }] };
      if (sql.includes("AS today")) return { rows: [{ today: overrides.today ?? "2026-01-10" }] };
      if (sql.includes("FROM subscriptions")) return { rows: overrides.overlap ?? [] };
      if (sql.includes("INSERT INTO payments")) return { rows: [{ id: "pay-1" }] };
      if (sql.includes("INSERT INTO subscriptions")) return { rows: [{ id: "sub-1" }] };
      return { rows: [] };
    });

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("returns 400 when the user has no active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Elegí una sucursal" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects a plate with no alphanumeric characters", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...payload, plate: " !-- " }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Patente inválida" });
  });

  it("requires a monthly plan", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...payload, tariffId: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Elegí el plan mensual" });
  });

  it("requires ISO dates", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...payload, startsOn: "01/01/2026" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Fechas inválidas (YYYY-MM-DD)" });
  });

  it("rejects an end date before the start date", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...payload, endsOn: "2025-12-31" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El fin debe ser posterior al inicio" });
  });

  it("requires a payment method", async () => {
    const res = await POST(jsonRequest(url, "POST", { ...payload, methodId: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Elegí el medio de pago" });
  });

  it("rejects a plan that is not active in the branch", async () => {
    db.query.mockResolvedValue([]);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El plan mensual no existe o no está activo en esta sucursal",
    });
  });

  it("requires an open cash shift", async () => {
    db.query.mockResolvedValue([plan]);
    db.pool.connect.mockResolvedValue(handler({ shift: [] }));

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "NO_OPEN_SHIFT",
      error: "Abrí un turno de caja antes de cobrar un abono.",
    });
  });

  it("rejects a plate registered under another vehicle type", async () => {
    db.query.mockResolvedValue([plan]);
    db.pool.connect.mockResolvedValue(
      handler({ vehicles: [{ id: "veh-1", vehicle_type_id: "vt-2" }] }),
    );

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La patente AB123CD está registrada como Auto pero el plan es de otro tipo.",
    });
  });

  it("rejects an overlapping active subscription", async () => {
    db.query.mockResolvedValue([plan]);
    db.pool.connect.mockResolvedValue(
      handler({
        vehicles: [{ id: "veh-1", vehicle_type_id: "vt-1" }],
        overlap: [{ id: "sub-old" }],
      }),
    );

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya hay un abono vigente para esa patente en ese período.",
    });
  });

  it("creates the vehicle, the payment and the subscription for a new plate", async () => {
    db.query.mockResolvedValue([plan]);
    const client = handler();
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: "sub-1", paymentId: "pay-1" });

    const vehicleInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vehicles"),
    );
    expect(vehicleInsert?.[1]).toEqual(["AB123CD", "vt-1", "user-1"]);

    const paymentInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO payments"),
    );
    expect(paymentInsert?.[1]).toEqual(["branch-1", "pm-1", 900_000, "user-1", "shift-1"]);

    const subscriptionInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO subscriptions"),
    );
    expect(subscriptionInsert?.[1]).toEqual([
      "branch-1",
      "veh-new",
      "t-1",
      "2026-01-01",
      "2026-01-31",
      900_000,
      "pay-1",
      null,
      "user-1",
    ]);

    expect(client.query.mock.calls.map(([sql]) => String(sql))).toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
    const audit = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("'subscription.create'"),
    );
    expect(audit?.[1]?.[0]).toBe("user-1");
    expect(audit?.[1]?.[1]).toBe("branch-1");
    expect(JSON.parse(String(audit?.[1]?.[3]))).toMatchObject({
      plate: "AB123CD",
      tariffId: "t-1",
      amountCents: 900_000,
      today: "2026-01-10",
    });
  });

  it("reuses an existing vehicle of the same type", async () => {
    db.query.mockResolvedValue([plan]);
    const client = handler({ vehicles: [{ id: "veh-1", vehicle_type_id: "vt-1" }] });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(201);
    expect(
      client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO vehicles")),
    ).toBe(false);
    const subscriptionInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO subscriptions"),
    );
    expect(subscriptionInsert?.[1]?.[1]).toBe("veh-1");
  });

  it("returns 409 on a unique violation", async () => {
    db.query.mockResolvedValue([plan]);
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO subscriptions")) throw pgError("23505");
      if (sql.includes("FROM cash_shifts")) return { rows: [{ id: "shift-1" }] };
      if (sql.includes("INSERT INTO vehicles")) return { rows: [{ id: "veh-new" }] };
      if (sql.includes("AS today")) return { rows: [{ today: "2026-01-10" }] };
      if (sql.includes("INSERT INTO payments")) return { rows: [{ id: "pay-1" }] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya hay un abono activo para esa patente.",
    });
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
  });

  it("maps a foreign key violation to a 400", async () => {
    db.query.mockResolvedValue([plan]);
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO payments")) throw pgError("23503");
      if (sql.includes("FROM cash_shifts")) return { rows: [{ id: "shift-1" }] };
      if (sql.includes("INSERT INTO vehicles")) return { rows: [{ id: "veh-new" }] };
      if (sql.includes("AS today")) return { rows: [{ today: "2026-01-10" }] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", payload));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Datos del abono inválidos" });
  });
});

describe("PATCH /api/subscriptions", () => {
  const url = "http://localhost/api/subscriptions";

  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sub-1" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("requires tariff.manage", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sub-1" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
  });

  it("returns 400 when the user has no active branch", async () => {
    session.getSessionUser.mockResolvedValue(makeUser({ branchId: null }));

    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Elegí una sucursal" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires the subscription id", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", {}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el abono" });
  });

  it("returns 404 when the subscription is gone or already cancelled", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sub-1" }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Abono inexistente o ya cancelado" });
  });

  it("cancels the subscription scoped to the branch and audits it", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE subscriptions")) return [{ id: "sub-1" }];
      return [];
    });

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "sub-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const update = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE subscriptions"),
    );
    expect(update?.[1]).toEqual(["sub-1", "branch-1"]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'subscription.cancel'")),
    ).toBe(true);
  });
});
