import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/shifts/open/route";
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

function post(body?: unknown) {
  return POST(
    new Request("http://localhost/api/shifts/open", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  mockQuery.mockResolvedValue([]);
});

describe("POST /api/shifts/open", () => {
  it("inserts the shift, audits it and returns the new id", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_at: "2026-01-15 09:00:00+00" }])
      .mockResolvedValueOnce([]);

    const res = await post({ notes: "turno mañana" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      shiftId: "shift-1",
      openedAt: "2026-01-15 09:00:00+00",
    });
    expect(mockContext).toHaveBeenCalledWith("shift.manage");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["user-1", "branch-1", "turno mañana"]);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual(["user-1", "branch-1", "shift-1"]);
  });

  it("opens a shift without a body and stores null notes", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_at: "2026-01-15 09:00:00+00" }])
      .mockResolvedValueOnce([]);

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["user-1", "branch-1", null]);
  });

  it("ignores empty notes and a malformed body (body is optional)", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "shift-1", opened_at: "2026-01-15 09:00:00+00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "shift-2", opened_at: "2026-01-15 10:00:00+00" }])
      .mockResolvedValueOnce([]);

    await post({ notes: "" });
    await post("{no-json");

    expect(mockQuery.mock.calls[0]?.[1]?.[2]).toBeNull();
    expect(mockQuery.mock.calls[2]?.[1]?.[2]).toBeNull();
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

  it("returns 400 with a friendly message on the open-shift unique violation", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "uq_open_cash_shift"'),
    );

    const res = await post();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Ya hay un turno abierto en esta sucursal. Cerralo antes de abrir otro.",
    });
  });

  it("maps any other failure to 400 with the driver message", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection terminated"));

    const res = await post();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "connection terminated" });
  });
});
