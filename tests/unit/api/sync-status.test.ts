import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/sync/status/route";
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
  userId: "admin-1",
  email: "admin@parking.test",
  name: "Admin",
  role: "admin" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

const byStatus = [
  { status: "pending", count: "3" },
  { status: "error", count: "1" },
];

const recentRuns = [
  {
    id: "run-1",
    direction: "push",
    started_at: "2026-01-15 09:00:00+00",
    finished_at: "2026-01-15 09:00:05+00",
    ops_pushed: 3,
    ops_pulled: 0,
    errors: 0,
    trigger: "auto",
  },
];

const recentErrors = [
  {
    operation_id: "op-1",
    entity_type: "parking_session",
    op: "update",
    attempts: 3,
    last_error: "connection reset",
    created_at: "2026-01-15 08:00:00+00",
  },
];

beforeEach(() => {
  mockSession.mockResolvedValue(user);
  mockPermission.mockResolvedValue(true);
  mockQuery
    .mockResolvedValueOnce(byStatus)
    .mockResolvedValueOnce(recentRuns)
    .mockResolvedValueOnce(recentErrors);
});

describe("GET /api/sync/status", () => {
  it("returns the outbox counters, recent runs and recent errors", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ byStatus, recentRuns, recentErrors });
    expect(mockPermission).toHaveBeenCalledWith(user, "sync.manage");
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 without sync.manage", async () => {
    mockPermission.mockResolvedValueOnce(false);

    const res = await GET();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "No tenés permiso" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps a database failure to 400", async () => {
    mockQuery.mockReset().mockRejectedValue(new Error("relation does not exist"));

    const res = await GET();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "relation does not exist" });
  });
});
