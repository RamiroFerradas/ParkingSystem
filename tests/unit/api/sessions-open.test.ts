import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/sessions/open/route";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/context", () => ({ getBranchContextOrFail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockContext = vi.mocked(getBranchContextOrFail);
const mockQuery = vi.mocked(query);

const context = {
  user: {
    userId: "user-1",
    email: "empleado@parking.test",
    name: "Empleado",
    role: "employee" as const,
    branchId: "branch-1",
    branchName: "Central",
    isMaster: false,
  },
  branchId: "branch-1",
  branchName: "Central",
  role: "employee" as const,
  isMaster: false,
  memberships: [],
  can: () => true,
};

type Reply = unknown[] | Error;

interface Handlers {
  box?: Reply;
  parked?: Reply;
  /** Used when a route re-checks parked vehicles after a race; last reply is sticky. */
  parkedSequence?: Reply[];
  openSession?: Reply;
}

/** Dispatches on the SQL text so tests do not depend on call order. */
function mockSql(handlers: Handlers) {
  const calls: { text: string; params?: unknown[] }[] = [];
  let parkedCalls = 0;
  const impl = async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    let reply: Reply = [];
    if (text.includes("FROM parking_boxes")) reply = handlers.box ?? [{ number: "A1" }];
    else if (text.includes("AND v.plate = $1")) {
      if (handlers.parkedSequence) {
        const seq = handlers.parkedSequence;
        reply = seq[Math.min(parkedCalls, seq.length - 1)] ?? [];
        parkedCalls += 1;
      } else {
        reply = handlers.parked ?? [];
      }
    } else if (text.includes("SELECT open_session")) {
      reply = handlers.openSession ?? [
        { r: { session_id: "session-1", ticket_number: "42", vehicle_id: "vehicle-1" } },
      ];
    }
    if (reply instanceof Error) throw reply;
    return reply;
  };
  mockQuery.mockImplementation(impl as unknown as typeof query);
  return calls;
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/sessions/open", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const parked = {
  session_id: "session-9",
  ticket_number: "7",
  box_id: "box-9",
  box_number: "B2",
  branch_id: "branch-1",
  entry_at: new Date(2026, 0, 15, 9, 0),
};

const valid = {
  sessionId: "session-1",
  plate: "ab 123 cd",
  vehicleTypeId: "type-1",
  boxId: "box-1",
};

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  mockSql({});
});

describe("POST /api/sessions/open", () => {
  it("opens a session with the normalized plate and returns the ticket number", async () => {
    const calls = mockSql({});

    const res = await post({ ...valid, keyLeft: true, damageNotes: "  rayón puerta  " });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sessionId: "session-1",
      ticketNumber: 42,
    });

    const rpc = calls.find((c) => c.text.includes("SELECT open_session"));
    expect(rpc?.params).toEqual([
      "session-1",
      "AB123CD",
      "type-1",
      "box-1",
      "user-1",
      null,
      true,
      "rayón puerta",
    ]);
    expect(calls[0]?.params).toEqual(["box-1", "branch-1"]);
    expect(mockContext).toHaveBeenCalledWith("session.open");
  });

  it("defaults keyLeft to false and truncates long damage notes to 500 chars", async () => {
    const calls = mockSql({});
    const longNotes = `  ${"x".repeat(600)}  `;

    await post({ ...valid, damageNotes: longNotes });

    const rpc = calls.find((c) => c.text.includes("SELECT open_session"));
    expect(rpc?.params?.[6]).toBe(false);
    expect(rpc?.params?.[7]).toHaveLength(500);
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await post(valid);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks session.open", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await post(valid);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Acceso restringido" });
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await post("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("requires sessionId, plate, vehicleTypeId and boxId", async () => {
    const res = await post({ ...valid, vehicleTypeId: 7 });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Faltan datos del ingreso" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects a plate with no alphanumerics", async () => {
    const res = await post({ ...valid, plate: "- . -" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Patente inválida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when the box is not in the active branch", async () => {
    mockSql({ box: [] });

    const res = await post(valid);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Box inexistente" });
  });

  it("returns 409 with the session details when the plate is already in that box", async () => {
    mockSql({ parked: [{ ...parked, box_id: "box-1", box_number: "A1" }] });

    const res = await post(valid);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: "VEHICLE_PARKED",
      error: "La patente AB123CD ya está en el box A1.",
      sameBox: true,
      session: {
        id: "session-9",
        ticketNumber: 7,
        boxId: "box-1",
        boxNumber: "A1",
        entryAt: parked.entry_at.toISOString(),
      },
    });
  });

  it("returns 409 pointing at the other box when the plate is parked elsewhere", async () => {
    mockSql({ parked: [parked] });

    const res = await post(valid);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(409);
    expect(body.code).toBe("VEHICLE_PARKED");
    expect(body.sameBox).toBe(false);
    expect(body.error).toBe("La patente AB123CD ya está estacionada en el box B2.");
  });

  it("does not leak box or ticket when the plate is parked in another branch", async () => {
    mockSql({ parked: [{ ...parked, branch_id: "branch-2" }] });

    const res = await post(valid);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(409);
    expect(body).toEqual({
      code: "VEHICLE_PARKED",
      error: "La patente AB123CD ya está estacionada en otra sucursal.",
    });
  });

  it("maps an open_session race to the parked-vehicle response", async () => {
    mockSql({
      parkedSequence: [[], [parked]],
      openSession: new Error("El box ya está ocupado"),
    });

    const res = await post(valid);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: "VEHICLE_PARKED",
      error: "La patente AB123CD ya está estacionada en el box B2.",
      sameBox: false,
      session: {
        id: "session-9",
        ticketNumber: 7,
        boxId: "box-9",
        boxNumber: "B2",
        entryAt: parked.entry_at.toISOString(),
      },
    });
  });

  it("returns 409 BOX_TAKEN when only the box was taken in the race", async () => {
    mockSql({ openSession: new Error("El box ya está ocupado") });

    const res = await post(valid);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: "BOX_TAKEN",
      error: "El box A1 ya está ocupado.",
    });
  });

  it("returns 409 NO_OPEN_SHIFT when there is no open cash shift", async () => {
    mockSql({ openSession: new Error("No hay turno de caja abierto") });

    const res = await post(valid);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: "NO_OPEN_SHIFT",
      error: "Abrí un turno de caja antes de registrar un ingreso.",
    });
  });

  it("maps any other RPC failure to 400", async () => {
    mockSql({ openSession: new Error("violates check constraint") });

    const res = await post(valid);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "violates check constraint" });
  });
});
