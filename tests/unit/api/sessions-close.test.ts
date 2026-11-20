import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/sessions/close/route";
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

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/sessions/close", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const closeResult = {
  session_id: "session-1",
  duration_minutes: 95,
  final_cents: "125000",
};

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  mockQuery.mockResolvedValue([]);
});

describe("POST /api/sessions/close", () => {
  it("closes the session and returns the charge breakdown", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockResolvedValueOnce([{ r: closeResult }]);

    const res = await post({ sessionId: "session-1", methodId: "method-1" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sessionId: "session-1",
      durationMinutes: 95,
      finalCents: 125000,
    });
    expect(mockContext).toHaveBeenCalledWith("session.close");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["session-1", "branch-1"]);
    // discount/surcharge stay at 0 until BR-OPEN-09 is resolved.
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([
      "session-1",
      "method-1",
      "user-1",
      null,
    ]);
  });

  it("forwards non-empty notes and drops empty ones", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockResolvedValueOnce([{ r: closeResult }])
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockResolvedValueOnce([{ r: closeResult }]);

    await post({ sessionId: "session-1", methodId: "method-1", notes: "cobro manual" });
    await post({ sessionId: "session-1", methodId: "method-1", notes: "" });

    expect(mockQuery.mock.calls[1]?.[1]?.[3]).toBe("cobro manual");
    expect(mockQuery.mock.calls[3]?.[1]?.[3]).toBeNull();
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await post({ sessionId: "session-1", methodId: "method-1" });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 when the role lacks session.close", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await post({ sessionId: "session-1", methodId: "method-1" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Acceso restringido" });
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await post("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("requires sessionId and methodId as strings", async () => {
    const res = await post({ sessionId: "session-1" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Faltan datos del cobro" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 404 for a session owned by another branch", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await post({ sessionId: "session-1", methodId: "method-1" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Estadía no encontrada" });
  });

  it("maps an RPC failure to 400 with the SQL message", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockRejectedValueOnce(new Error("No hay turno de caja abierto"));

    const res = await post({ sessionId: "session-1", methodId: "method-1" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No hay turno de caja abierto" });
  });
});
