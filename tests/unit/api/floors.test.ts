import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH, POST } from "@/app/api/floors/route";
import { fakeClient, jsonRequest, makeContext, pgError, rawRequest } from "./_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const authContext = vi.hoisted(() => ({ getBranchContextOrFail: vi.fn() }));
vi.mock("@/lib/auth/context", () => authContext);

const floor = { id: "floor-1", name: "Planta Baja", sort_order: 0, is_active: true };
const ok = () => authContext.getBranchContextOrFail.mockResolvedValue({
  context: makeContext(),
  error: null,
});

beforeEach(() => {
  ok();
  db.query.mockResolvedValue([]);
});

describe("POST /api/floors", () => {
  const url = "http://localhost/api/floors";

  it("returns 401 without a session", async () => {
    authContext.getBranchContextOrFail.mockResolvedValue({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await POST(jsonRequest(url, "POST", { name: "Planta" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
    expect(authContext.getBranchContextOrFail).toHaveBeenCalledWith("box.manage");
  });

  it("returns 403 when the permission is missing", async () => {
    authContext.getBranchContextOrFail.mockResolvedValue({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await POST(jsonRequest(url, "POST", { name: "Planta" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso restringido" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects an empty or too long floor name", async () => {
    const empty = await POST(jsonRequest(url, "POST", { name: "  " }));
    const tooLong = await POST(jsonRequest(url, "POST", { name: "x".repeat(51) }));

    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Nombre de piso inválido" });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: "Nombre de piso inválido" });
  });

  it("rejects a box count outside 0..120", async () => {
    const negative = await POST(jsonRequest(url, "POST", { name: "P", boxCount: -1 }));
    const huge = await POST(jsonRequest(url, "POST", { name: "P", boxCount: 121 }));

    expect(negative.status).toBe(400);
    expect(await negative.json()).toEqual({
      error: "Cantidad de boxes fuera de rango (0–120)",
    });
    expect(huge.status).toBe(400);
  });

  it("requires a valid prefix when boxes are generated", async () => {
    const missing = await POST(jsonRequest(url, "POST", { name: "P", boxCount: 3 }));
    const bad = await POST(
      jsonRequest(url, "POST", { name: "P", boxCount: 3, prefix: "AA-BB" }),
    );
    const tooLong = await POST(
      jsonRequest(url, "POST", { name: "P", boxCount: 3, prefix: "ABCDEFGHI" }),
    );

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({
      error: "Prefijo requerido (letras/números, hasta 8)",
    });
    expect(bad.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });

  it("creates the floor and its boxes in one transaction", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO parking_floors")) return { rows: [floor] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(
      jsonRequest(url, "POST", { name: " Planta Baja ", boxCount: 3, prefix: "a1", sortOrder: 2.8 }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, floor });
    // A2: the audit insert now runs inside the same transaction as the floor
    // and its boxes, so COMMIT is the last statement again.
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO parking_floors"),
      expect.stringContaining("INSERT INTO parking_boxes"),
      expect.stringContaining("INSERT INTO audit_logs"),
      "COMMIT",
    ]);
    const floorInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO parking_floors"),
    );
    expect(floorInsert?.[1]).toEqual(["Planta Baja", 2, "branch-1"]);
    const boxesInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO parking_boxes"),
    );
    expect(boxesInsert?.[1]).toEqual(["floor-1", "branch-1", ["A1-01", "A1-02", "A1-03"]]);
    const auditInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audit_logs"),
    );
    expect(auditInsert?.[1]).toEqual(["user-1", "branch-1", "floor-1", "Planta Baja", 3]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("creates a floor with no boxes when boxCount is 0", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO parking_floors")) return { rows: [floor] };
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", { name: "Planta Baja" }));

    expect(res.status).toBe(201);
    expect(
      client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO parking_boxes")),
    ).toBe(false);
  });

  it("rolls back and returns 409 on a unique violation", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO parking_floors")) throw pgError("23505");
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", { name: "Planta Baja" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya existe un piso con ese nombre o un box con ese número",
    });
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls the floor and boxes back when the audit insert fails", async () => {
    // A2: the audit insert must share the transaction, otherwise the floor and
    // its boxes stay committed while the client gets a 401.
    const client = fakeClient((sql) => {
      if (sql.includes("INSERT INTO parking_floors")) return { rows: [floor] };
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error('violates foreign key constraint "audit_logs_actor_id_fkey"');
      }
      return { rows: [] };
    });
    db.pool.connect.mockResolvedValue(client);

    const res = await POST(jsonRequest(url, "POST", { name: "Planta Baja", boxCount: 2, prefix: "A" }));

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

describe("PATCH /api/floors", () => {
  const url = "http://localhost/api/floors";

  it("returns 401 without a session", async () => {
    authContext.getBranchContextOrFail.mockResolvedValue({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "floor-1" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires the floor id", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Otro" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el piso" });
  });

  it("rejects an invalid new name", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { id: "floor-1", name: "   " }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nombre de piso inválido" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 404 when the floor is not in the active branch", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "floor-1", isActive: false }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Piso inexistente" });
  });

  it("updates name, order and active flag scoped to the branch", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE parking_floors")) return [floor];
      return [];
    });

    const res = await PATCH(
      jsonRequest(url, "PATCH", {
        id: "floor-1",
        name: " Planta Baja ",
        sortOrder: 4.9,
        isActive: false,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, floor });
    const update = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE parking_floors"),
    );
    expect(String(update?.[0])).toContain("AND branch_id = $2");
    expect(update?.[1]).toEqual(["floor-1", "branch-1", "Planta Baja", 4, false]);
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("'floor.update'")),
    ).toBe(true);
  });

  it("returns 409 on a duplicated floor name", async () => {
    db.query.mockRejectedValue(pgError("23505"));

    const res = await PATCH(jsonRequest(url, "PATCH", { id: "floor-1", name: "Otro" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya existe un piso con ese nombre" });
  });
});
