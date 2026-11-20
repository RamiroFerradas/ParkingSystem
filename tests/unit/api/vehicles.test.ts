import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/vehicles/route";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockSession = vi.mocked(getSessionUser);
const mockPermission = vi.mocked(hasPermission);
const mockQuery = vi.mocked(query);

const user = {
  userId: "user-1",
  email: "empleado@parking.test",
  name: "Empleado",
  role: "supervisor" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

const vehicle = {
  id: "vehicle-1",
  plate: "AB123CD",
  plate_is_placeholder: false,
  type_name: "Auto",
  notes: null,
  sessions_count: 3,
  last_seen_at: "2026-01-15 09:00:00+00",
};

function get(queryString = "") {
  return GET(new Request(`http://localhost/api/vehicles${queryString}`));
}

beforeEach(() => {
  mockSession.mockResolvedValue(user);
  mockPermission.mockResolvedValue(true);
  mockQuery.mockResolvedValue([vehicle]);
});

describe("GET /api/vehicles", () => {
  it("lists vehicles with the default query and limit", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ vehicles: [vehicle] });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["", 100]);
    expect(mockPermission).toHaveBeenCalledWith(user, "vehicle.read_all");
  });

  it("trims the search term and passes it to the query", async () => {
    await get("?q=%20ab12%20");

    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["ab12", 100]);
  });

  it("clamps the limit between 1 and 200", async () => {
    await get("?limit=0");
    await get("?limit=500");
    await get("?limit=25");

    expect(mockQuery.mock.calls[0]?.[1]?.[1]).toBe(1);
    expect(mockQuery.mock.calls[1]?.[1]?.[1]).toBe(200);
    expect(mockQuery.mock.calls[2]?.[1]?.[1]).toBe(25);
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 without vehicle.read_all", async () => {
    mockPermission.mockResolvedValueOnce(false);

    const res = await get();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "No tenés permiso para ver el listado de vehículos",
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps a database failure to 400", async () => {
    mockQuery.mockRejectedValueOnce(new Error("timeout"));

    const res = await get();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "timeout" });
  });
});
