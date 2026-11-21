import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

import { query } from "@/lib/db/client";
import { loadOpenShiftSummary } from "@/lib/queries/shift-summary";

const dbQuery = vi.mocked(query) as unknown as Mock;

// es-AR currency output uses a non-breaking space after "$"; normalize it.
const ns = (s: string) => s.replace(/\u00a0|\u202f/g, " ");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    // 12:05Z = 09:05 en la zona del establecimiento.
    opened_at_ms: String(new Date("2026-01-15T12:05:00Z").getTime()),
    opened_by: "user-1",
    opened_by_name: "Operador Uno",
    collected: "123456",
    open_sessions: "3",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // 14:35:30Z = 11:35:30 ART: 150 minutos después de la apertura.
  vi.setSystemTime(new Date("2026-01-15T14:35:30Z"));
  dbQuery.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loadOpenShiftSummary", () => {
  it("returns null when the branch has no open shift", async () => {
    await expect(
      loadOpenShiftSummary("branch-1", { userId: "user-1", role: "employee" }),
    ).resolves.toBeNull();
  });

  it("queries the active branch's open shift and passes the branch id", async () => {
    await loadOpenShiftSummary("branch-1", { userId: "user-1", role: "employee" });

    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(sql).toContain("WHERE cs.status = 'open' AND cs.branch_id = $1");
    expect(sql).toContain("LIMIT 1");
    expect(params).toEqual(["branch-1"]);
  });

  it("maps ids, timestamps, counters and the ARS total", async () => {
    dbQuery.mockResolvedValue([row()]);

    const summary = await loadOpenShiftSummary("branch-1", {
      userId: "user-1",
      role: "employee",
    });

    expect({ ...summary, collectedLabel: ns(summary!.collectedLabel) }).toEqual({
      id: "shift-1",
      openedAtMs: new Date("2026-01-15T12:05:00Z").getTime(),
      elapsedMinutes: 150,
      // 12:05Z es 09:05 en la zona del establecimiento.
      openedAtLabel: "09:05",
      openedByName: "Operador Uno",
      collectedLabel: "$ 1.234,56",
      openSessions: 3,
      canClose: true,
    });
  });

  it("floors the elapsed minutes and never goes negative", async () => {
    vi.setSystemTime(new Date(2026, 0, 15, 9, 4, 0));
    dbQuery.mockResolvedValue([row()]);

    const summary = await loadOpenShiftSummary("branch-1", {
      userId: "user-1",
      role: "employee",
    });

    expect(summary!.elapsedMinutes).toBe(0);
  });

  it("lets admin and supervisor close any shift", async () => {
    dbQuery.mockResolvedValue([row({ opened_by: "someone-else" })]);

    for (const role of ["admin", "supervisor"]) {
      const summary = await loadOpenShiftSummary("branch-1", { userId: "user-1", role });
      expect(summary!.canClose).toBe(true);
    }
  });

  it("lets an employee close only the shift they opened", async () => {
    dbQuery.mockResolvedValue([row({ opened_by: "user-1" })]);
    const own = await loadOpenShiftSummary("branch-1", { userId: "user-1", role: "employee" });
    expect(own!.canClose).toBe(true);

    dbQuery.mockResolvedValue([row({ opened_by: "user-2" })]);
    const foreign = await loadOpenShiftSummary("branch-1", {
      userId: "user-1",
      role: "employee",
    });
    expect(foreign!.canClose).toBe(false);
  });

  it("treats a null role as 'not a manager'", async () => {
    dbQuery.mockResolvedValue([row({ opened_by: "user-2" })]);

    const summary = await loadOpenShiftSummary("branch-1", { userId: "user-1", role: null });

    expect(summary!.canClose).toBe(false);
  });
});
