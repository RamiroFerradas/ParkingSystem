import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/audit-logs/route";
import { makeUser } from "./_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const permissions = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => permissions);

const log = {
  id: "log-1",
  occurred_at: "2026-01-01 10:00:00+00",
  actor_name: "Admin",
  action: "auth.login",
  entity_type: "profile",
  entity_id: "user-1",
  before: null,
  after: null,
};

const request = (query = "") =>
  new Request(`http://localhost/api/audit-logs${query}`, { method: "GET" });

beforeEach(() => {
  session.getSessionUser.mockResolvedValue(makeUser());
  permissions.hasPermission.mockResolvedValue(true);
  db.query.mockResolvedValue([]);
});

describe("GET /api/audit-logs", () => {
  it("returns 401 without a session", async () => {
    session.getSessionUser.mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 without audit.read", async () => {
    permissions.hasPermission.mockResolvedValue(false);

    const res = await GET(request());

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tenés permiso" });
    expect(permissions.hasPermission).toHaveBeenCalledWith(expect.anything(), "audit.read");
  });

  it("returns the logs with default filters and limit", async () => {
    db.query.mockResolvedValue([log]);

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ logs: [log] });
    expect(db.query.mock.calls[0]?.[1]).toEqual([null, null, 100]);
  });

  it("passes action and entityType filters through", async () => {
    await GET(request("?action=%20login%20&entityType=profile"));

    expect(db.query.mock.calls[0]?.[1]).toEqual(["login", "profile", 100]);
  });

  it("clamps the limit into 1..500", async () => {
    await GET(request("?limit=1000"));
    expect(db.query.mock.calls[0]?.[1]?.[2]).toBe(500);

    await GET(request("?limit=0"));
    expect(db.query.mock.calls[1]?.[1]?.[2]).toBe(1);
  });

  it("turns blank filters into null", async () => {
    await GET(request("?action=%20&entityType="));

    expect(db.query.mock.calls[0]?.[1]).toEqual([null, null, 100]);
  });

  it("falls back to the default limit when it is not a number", async () => {
    // A4: the old expectation pinned the bug (`toBeNaN()`, NaN reached LIMIT $3).
    // A non-numeric limit must degrade to the default instead of failing the query.
    await GET(request("?limit=abc"));

    expect(db.query.mock.calls[0]?.[1]).toEqual([null, null, 100]);
  });

  it("maps a database failure to a 400", async () => {
    db.query.mockRejectedValue(new Error("boom"));

    const res = await GET(request());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
