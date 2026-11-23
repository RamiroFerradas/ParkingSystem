import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/shifts/close/route";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/context", () => ({ getBranchContextOrFail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockContext = vi.mocked(getBranchContextOrFail);
const mockQuery = vi.mocked(query);

type Role = "admin" | "supervisor" | "employee";

function makeContext(role: Role = "employee") {
  return {
    user: {
      userId: "user-1",
      email: "empleado@parking.test",
      name: "Empleado",
      role,
      branchId: "branch-1",
      branchName: "Central",
      isMaster: false,
    },
    branchId: "branch-1",
    branchName: "Central",
    role,
    isMaster: false,
    memberships: [],
    can: () => true,
  };
}

function post(body?: unknown) {
  return POST(
    new Request("http://localhost/api/shifts/close", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockContext.mockResolvedValue({ context: makeContext(), error: null });
  mockQuery.mockResolvedValue([]);
});

describe("POST /api/shifts/close", () => {
  it("closes the shift opened by the same employee", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ id: "shift-1" }])
      .mockResolvedValueOnce([]);

    const res = await post({ notes: "cierre normal" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      shiftId: "shift-1",
      openSessions: 0,
    });
    expect(mockContext).toHaveBeenCalledWith("shift.manage");
    expect(mockQuery.mock.calls[2]?.[1]).toEqual([
      "user-1",
      "cierre normal",
      0,
      "shift-1",
      "branch-1",
    ]);
    expect(mockQuery.mock.calls[3]?.[1]).toEqual([
      "user-1",
      "branch-1",
      "shift-1",
      JSON.stringify({ open_sessions: 0, forced: false }),
    ]);
  });

  it("lets an admin close a shift opened by somebody else", async () => {
    mockContext.mockResolvedValueOnce({ context: makeContext("admin"), error: null });
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-9" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ id: "shift-1" }])
      .mockResolvedValueOnce([]);

    const res = await post();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      shiftId: "shift-1",
      openSessions: 0,
    });
  });

  it("lets a supervisor close a shift opened by somebody else", async () => {
    mockContext.mockResolvedValueOnce({ context: makeContext("supervisor"), error: null });
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-9" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ id: "shift-1" }])
      .mockResolvedValueOnce([]);

    const res = await post();

    expect(res.status).toBe(200);
  });

  it("returns 400 when there is no open shift", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await post();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No hay turno abierto" });
  });

  it("forbids an employee from closing another employee's shift", async () => {
    mockQuery.mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-9" }]);

    const res = await post();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Solo podés cerrar el turno que abriste.",
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("blocks closing with two sessions still open", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "2" }]);

    const res = await post();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: "SHIFT_HAS_OPEN_SESSIONS",
      openSessions: 2,
      sessions: [],
      error:
        "Hay 2 vehículos sin egreso. Si cerrás el turno, sus cobros quedarán en el próximo turno.",
    });
  });

  it("uses the singular wording for a single open session", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "1" }]);

    const res = await post();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.error).toBe(
      "Hay 1 vehículo sin egreso. Si cerrás el turno, sus cobros quedarán en el próximo turno.",
    );
  });

  it("returns 400 when the update matched no open shift", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([]);

    const res = await post();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No hay turno abierto" });
  });

  it("treats an empty or malformed body as no notes", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ id: "shift-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ id: "shift-1" }])
      .mockResolvedValueOnce([]);

    await post("{no-json");
    await post({ notes: "" });

    expect(mockQuery.mock.calls[2]?.[1]?.[1]).toBeNull();
    expect(mockQuery.mock.calls[6]?.[1]?.[1]).toBeNull();
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await post();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks shift.manage", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await post();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Acceso restringido" });
  });

  it("maps a database failure during the update to 400", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_by: "user-1" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockRejectedValueOnce(new Error("lock timeout"));

    const res = await post();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "lock timeout" });
  });
});
