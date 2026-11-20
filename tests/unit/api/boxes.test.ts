import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, PATCH } from "@/app/api/boxes/route";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/context", () => ({ getBranchContextOrFail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockContext = vi.mocked(getBranchContextOrFail);
const mockQuery = vi.mocked(query);

const context = {
  user: {
    userId: "admin-1",
    email: "admin@parking.test",
    name: "Admin",
    role: "admin" as const,
    branchId: "branch-1",
    branchName: "Central",
    isMaster: false,
  },
  branchId: "branch-1",
  branchName: "Central",
  role: "admin" as const,
  isMaster: false,
  memberships: [],
  can: () => true,
};

type Reply = unknown[] | Error;

interface Handlers {
  floor?: Reply;
  current?: Reply;
  openSessions?: Reply;
  insert?: Reply;
  update?: Reply;
  audit?: Reply;
}

function mockSql(handlers: Handlers = {}) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const impl = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    let reply: Reply = [];
    const sql = text.trim();
    if (sql.startsWith("SELECT id FROM parking_floors")) reply = handlers.floor ?? [{ id: "floor-1" }];
    else if (sql.startsWith("SELECT number, floor_id FROM parking_boxes"))
      reply = handlers.current ?? [{ number: "A1", floor_id: "floor-1" }];
    else if (sql.startsWith("SELECT id FROM parking_sessions")) reply = handlers.openSessions ?? [];
    else if (sql.startsWith("INSERT INTO parking_boxes"))
      reply = handlers.insert ?? [
        { id: "box-1", number: "B2", sector: null, floor_id: "floor-1", is_active: true },
      ];
    else if (sql.startsWith("UPDATE parking_boxes"))
      reply = handlers.update ?? [
        { id: "box-1", number: "B2", sector: null, floor_id: "floor-1", is_active: true },
      ];
    else if (sql.startsWith("INSERT INTO audit_logs")) reply = handlers.audit ?? [];
    if (reply instanceof Error) throw reply;
    return reply;
  };
  mockQuery.mockImplementation(impl as unknown as typeof query);
  return calls;
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/boxes", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/boxes", {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function pgError(code: string): Error {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  mockSql();
});

describe("POST /api/boxes", () => {
  it("creates a box with an upper-cased trimmed number and audits it", async () => {
    const calls = mockSql();

    const res = await post({ floorId: "floor-1", number: "  b2 ", sector: "  Norte " });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      box: { id: "box-1", number: "B2", sector: null, floor_id: "floor-1", is_active: true },
    });
    expect(mockContext).toHaveBeenCalledWith("box.manage");
    expect(calls[0]?.params).toEqual(["floor-1", "branch-1"]);
    expect(calls[1]?.params).toEqual(["B2", "Norte", "floor-1", "branch-1"]);
    expect(calls[2]?.params).toEqual(["admin-1", "branch-1", "box-1", "B2", "floor-1"]);
  });

  it("stores null when the sector is blank", async () => {
    const calls = mockSql();

    await post({ floorId: "floor-1", number: "B2", sector: "   " });

    expect(calls[1]?.params?.[1]).toBeNull();
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await post({ floorId: "floor-1", number: "B2" });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks box.manage", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await post({ floorId: "floor-1", number: "B2" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Acceso restringido" });
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await post("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("requires a floor and a number of up to 12 characters", async () => {
    const missing = await post({ number: "A1" });
    const tooLong = await post({ floorId: "floor-1", number: "1234567890123" });
    const blank = await post({ floorId: "floor-1", number: "   " });

    for (const res of [missing, tooLong, blank]) {
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Necesito el piso y un número de box (hasta 12 caracteres)",
      });
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 400 when the floor is not in the active branch", async () => {
    mockSql({ floor: [] });

    const res = await post({ floorId: "floor-9", number: "B2" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "El piso indicado no existe" });
  });

  it("maps a duplicate number to 409", async () => {
    mockSql({ insert: pgError("23505") });

    const res = await post({ floorId: "floor-1", number: "B2" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Ya existe un box con ese número" });
  });

  it("maps a missing floor foreign key to 400", async () => {
    mockSql({ insert: pgError("23503") });

    const res = await post({ floorId: "floor-1", number: "B2" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "El piso indicado no existe" });
  });

  it("maps any other insert failure to 400", async () => {
    mockSql({ insert: new Error("connection reset") });

    const res = await post({ floorId: "floor-1", number: "B2" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "connection reset" });
  });
});

describe("PATCH /api/boxes", () => {
  it("updates the sector without a structural pre-check", async () => {
    const calls = mockSql({
      update: [{ id: "box-1", number: "A1", sector: "Norte", floor_id: "floor-1", is_active: true }],
    });

    const res = await patch({ id: "box-1", sector: "Norte" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      box: { id: "box-1", number: "A1", sector: "Norte", floor_id: "floor-1", is_active: true },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.params).toEqual(["box-1", "branch-1", "Norte"]);
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await patch({ id: "box-1", sector: "Norte" });

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks box.manage", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await patch({ id: "box-1", sector: "Norte" });

    expect(res.status).toBe(403);
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await patch("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("requires the box id", async () => {
    const res = await patch({ sector: "Norte" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Falta el box" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when a structural change targets a box of another branch", async () => {
    mockSql({ current: [] });

    const res = await patch({ id: "box-9", number: "B2" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Box inexistente" });
  });

  it("refuses to deactivate a box with an open session", async () => {
    mockSql({ openSessions: [{ id: "session-1" }] });

    const res = await patch({ id: "box-1", isActive: false });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "No podés dar de baja un box con una estadía abierta",
    });
  });

  it("refuses to renumber a box with an open session", async () => {
    mockSql({ openSessions: [{ id: "session-1" }] });

    const res = await patch({ id: "box-1", number: "B2" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "No podés cambiar el número o el piso de un box con una estadía abierta",
    });
  });

  it("does not run the open-session pre-check for a plain sector change", async () => {
    const calls = mockSql();

    const res = await patch({ id: "box-1", sector: "Norte" });

    expect(res.status).toBe(200);
    expect(calls.some((c) => c.text.includes("FROM parking_sessions"))).toBe(false);
  });

  it("updates the number with the normalized value", async () => {
    const calls = mockSql({
      update: [{ id: "box-1", number: "B2", sector: null, floor_id: "floor-1", is_active: true }],
    });

    const res = await patch({ id: "box-1", number: " b2 " });

    expect(res.status).toBe(200);
    const update = calls.find((c) => c.text.trim().startsWith("UPDATE parking_boxes"));
    expect(update?.params).toEqual(["box-1", "branch-1", "B2"]);
  });

  it("rejects an empty or over-long number", async () => {
    mockSql({ current: [{ number: "A1", floor_id: "floor-1" }] });

    const empty = await patch({ id: "box-1", number: "   " });
    const tooLong = await patch({ id: "box-1", number: "1234567890123" });

    for (const res of [empty, tooLong]) {
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Número de box inválido" });
    }
  });

  it("returns 404 when the update matched no row", async () => {
    mockSql({ update: [] });

    const res = await patch({ id: "box-1", sector: "Norte" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Box inexistente" });
  });

  it("maps a duplicate number to 409", async () => {
    mockSql({ update: pgError("23505") });

    const res = await patch({ id: "box-1", sector: "Norte" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Ya existe un box con ese número" });
  });

  it("maps a missing floor foreign key to 400", async () => {
    mockSql({ current: [{ number: "A1", floor_id: "floor-1" }], update: pgError("23503") });

    const res = await patch({ id: "box-1", floorId: "floor-9" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "El piso indicado no existe" });
  });

  it("audits the resulting values as JSON", async () => {
    const calls = mockSql();

    await patch({ id: "box-1", sector: "Norte", isActive: true });

    const audit = calls.find((c) => c.text.trim().startsWith("INSERT INTO audit_logs"));
    expect(audit?.params?.[3]).toBe(
      JSON.stringify({ sector: "Norte", isActive: true }),
    );
  });
});
