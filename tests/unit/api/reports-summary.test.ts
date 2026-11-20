import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/reports/summary/route";
import type { SummaryTotals } from "@/app/api/reports/summary/route";
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
  email: "supervisor@parking.test",
  name: "Supervisor",
  role: "supervisor" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

const daily = [{ day: "2026-01-15", sessions: "4", collected: "500000" }];
const byMethod = [{ method_name: "Efectivo", sessions: "4", collected: "500000" }];
const totals = [{ sessions: "4", collected: "500000" }];

function get(queryString = "") {
  return GET(new Request(`http://localhost/api/reports/summary${queryString}`));
}

beforeEach(() => {
  mockSession.mockResolvedValue(user);
  mockPermission.mockResolvedValue(true);
  // The handler fires three queries in parallel; reply by position on every round.
  let round = 0;
  const replies = [daily, byMethod, totals];
  mockQuery.mockImplementation((async () => {
    const reply = replies[round % 3];
    round += 1;
    return reply;
  }) as unknown as typeof query);
});

describe("GET /api/reports/summary", () => {
  it("returns the daily, per-method and total aggregates for 30 days by default", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      days: 30,
      daily,
      byMethod,
      totals: totals[0],
    });
    expect(mockPermission).toHaveBeenCalledWith(user, "reports.read");
    expect(mockQuery.mock.calls.map((c) => c[1])).toEqual([["30"], ["30"], ["30"]]);
  });

  it("exposes only the totals columns the SQL actually selects", async () => {
    // B6: `annulled` was declared on the totals type but never selected, so it
    // never reached the JSON. Nobody consumes it (grep "annulled" src/), so the
    // fix drops the phantom field instead of adding a query.
    const res = await get();

    const body = (await res.json()) as { totals: Record<string, unknown> };
    expect(Object.keys(body.totals).sort()).toEqual(["collected", "sessions"]);
    expect(body.totals).not.toHaveProperty("annulled");
    const totalsSql = String(mockQuery.mock.calls[2]?.[0]);
    expect(totalsSql).not.toContain("annulled");
  });

  it("declares only the totals keys that the response carries", () => {
    // Type-level guard: fails `tsc --noEmit` if a phantom key is declared again.
    type Keys = keyof SummaryTotals;
    type Expected = "sessions" | "collected";
    type Exact = [Keys] extends [Expected] ? ([Expected] extends [Keys] ? true : false) : false;
    const exact: Exact = true;

    expect(exact).toBe(true);
  });

  it("honours an explicit days window", async () => {
    const res = await get("?days=7");
    const body = (await res.json()) as { days: number };

    expect(body.days).toBe(7);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["7"]);
  });

  it("clamps the window between 1 and 365 days", async () => {
    const first = (await (await get("?days=0")).json()) as { days: number };
    const second = (await (await get("?days=9999")).json()) as { days: number };

    expect(first.days).toBe(1);
    expect(second.days).toBe(365);
  });

  it("falls back to zeroed totals when the aggregate returns no row", async () => {
    mockQuery
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await get();

    await expect(res.json()).resolves.toEqual({
      days: 30,
      daily: [],
      byMethod: [],
      totals: { sessions: "0", collected: "0" },
    });
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 without reports.read", async () => {
    mockPermission.mockResolvedValueOnce(false);

    const res = await get();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "No tenés permiso" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps a database failure to 400", async () => {
    mockQuery.mockReset().mockRejectedValue(new Error("division by zero"));

    const res = await get();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "division by zero" });
  });
});
