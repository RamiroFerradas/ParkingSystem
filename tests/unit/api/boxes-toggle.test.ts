import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/boxes/toggle/route";
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

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/boxes/toggle", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  mockQuery.mockResolvedValue([]);
});

describe("POST /api/boxes/toggle", () => {
  it("puts a box back in service", async () => {
    mockQuery.mockResolvedValueOnce([{ is_service_enabled: true }]).mockResolvedValueOnce([]);

    const res = await post({ boxId: "box-1", serviceEnabled: true });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, isServiceEnabled: true });
    expect(mockContext).toHaveBeenCalledWith("box.manage");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["box-1", "branch-1", true]);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([
      "admin-1",
      "branch-1",
      "box.enable",
      "box-1",
      true,
    ]);
  });

  it("takes a box out of service and audits the disable action", async () => {
    mockQuery.mockResolvedValueOnce([{ is_service_enabled: false }]).mockResolvedValueOnce([]);

    const res = await post({ boxId: "box-1", serviceEnabled: false });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, isServiceEnabled: false });
    expect(mockQuery.mock.calls[1]?.[1]?.[2]).toBe("box.disable");
  });

  it("returns 401 when there is no session", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await post({ boxId: "box-1", serviceEnabled: true });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks box.manage", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await post({ boxId: "box-1", serviceEnabled: true });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Acceso restringido" });
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await post("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("requires a string boxId and a boolean serviceEnabled", async () => {
    const missing = await post({ boxId: "box-1" });
    const wrongType = await post({ boxId: "box-1", serviceEnabled: "true" });

    for (const res of [missing, wrongType]) {
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Faltan datos" });
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when the box is not in the active branch", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await post({ boxId: "box-9", serviceEnabled: true });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Box inexistente" });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("maps a database failure to 400", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await post({ boxId: "box-1", serviceEnabled: true });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "connection refused" });
  });
});
