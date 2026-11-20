import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/sessions/[id]/route";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/context", () => ({ getBranchContextOrFail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockContext = vi.mocked(getBranchContextOrFail);
const mockQuery = vi.mocked(query);

const SESSION_ID = "11111111-2222-3333-4444-555555555555";

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

function get(id = SESSION_ID) {
  return GET(new Request(`http://localhost/api/sessions/${id}`, { method: "GET" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  mockQuery.mockResolvedValue([]);
});

describe("GET /api/sessions/[id]", () => {
  it("returns the full session payload scoped to the active branch", async () => {
    const row = {
      ticket_number: "42",
      plate: "AB123CD",
      vehicle_type_name: "Auto",
      box_number: "A1",
      entry_at: "2026-01-15 09:00:00+00",
      exit_at: null,
      status: "open",
      duration_minutes: null,
      base_amount_cents: null,
      discount_cents: null,
      surcharge_cents: null,
      final_amount_cents: null,
      method_name: null,
      tariff_snapshot: null,
      entry_notes: null,
      key_left: false,
      damage_notes: null,
    };
    mockQuery.mockResolvedValueOnce([row]);

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ session: row });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([SESSION_ID, "branch-1"]);
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when the active branch cannot be resolved", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Seleccioná una sucursal" } },
    });

    const res = await get();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Seleccioná una sucursal" });
  });

  it("rejects a malformed identifier before touching the database", async () => {
    const res = await get("not-a-uuid");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Identificador inválido" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when the session does not belong to the branch", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await get();

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Estadía no encontrada" });
  });

  it("maps a database failure to a 400 with the driver message", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await get();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "connection refused" });
  });

  it("maps an actor foreign-key failure to 401", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error('violates foreign key constraint "parking_sessions_opened_by_fkey"'),
    );

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Tu sesión ya no es válida. Volvé a iniciar sesión.",
    });
  });
});
