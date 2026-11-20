import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/vehicles/lookup/route";
import { getSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockSession = vi.mocked(getSessionUser);
const mockQuery = vi.mocked(query);

const user = {
  userId: "user-1",
  email: "empleado@parking.test",
  name: "Empleado",
  role: "employee" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

function get(queryString = "") {
  return GET(new Request(`http://localhost/api/vehicles/lookup${queryString}`));
}

beforeEach(() => {
  mockSession.mockResolvedValue(user);
  mockQuery.mockResolvedValue([]);
});

describe("GET /api/vehicles/lookup", () => {
  it("returns found:false for a plate with no alphanumerics, without querying", async () => {
    const res = await get("?plate=-.-");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ found: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns found:false when the plate is missing", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ found: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("normalizes the plate and scopes the lookup to the active branch", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        vehicle_type_id: "type-1",
        vehicle_type_name: "Auto",
        subscription_ends_on: null,
      },
    ]);

    await get("?plate=ab-123-cd");

    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["AB123CD", "branch-1"]);
  });

  it("returns the vehicle type and active subscription when found", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        vehicle_type_id: "type-1",
        vehicle_type_name: "Auto",
        subscription_ends_on: "2026-03-31",
      },
    ]);

    const res = await get("?plate=AB123CD");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      found: true,
      vehicleTypeId: "type-1",
      vehicleTypeName: "Auto",
      subscription: { active: true, endsOn: "2026-03-31" },
    });
  });

  it("returns a null subscription when the vehicle has none", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        vehicle_type_id: "type-1",
        vehicle_type_name: "Auto",
        subscription_ends_on: null,
      },
    ]);

    const res = await get("?plate=AB123CD");

    await expect(res.json()).resolves.toEqual({
      found: true,
      vehicleTypeId: "type-1",
      vehicleTypeName: "Auto",
      subscription: null,
    });
  });

  it("returns found:false when the plate is unknown", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await get("?plate=ZZ999ZZ");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ found: false });
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await get("?plate=AB123CD");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
