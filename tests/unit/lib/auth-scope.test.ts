import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/context", () => ({ getBranchContext: vi.fn() }));

import { getBranchContext, type BranchContext } from "@/lib/auth/context";
import type { SessionUser } from "@/lib/auth/session";
import { historialScopeForSession } from "@/lib/auth/scope";

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: "user-1",
    email: "op@parking.test",
    name: "Operador",
    role: "employee",
    branchId: "branch-1",
    branchName: "Centro",
    isMaster: false,
    ...overrides,
  };
}

function context(overrides: Partial<BranchContext> = {}): BranchContext {
  return {
    user: session(),
    branchId: "branch-1",
    branchName: "Centro",
    role: "employee",
    isMaster: false,
    memberships: [],
    can: () => false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getBranchContext).mockResolvedValue(context());
});

describe("historialScopeForSession", () => {
  it("returns null without a session", async () => {
    vi.mocked(getBranchContext).mockResolvedValue(null);

    await expect(historialScopeForSession()).resolves.toBeNull();
  });

  it("keeps the whole branch visible with session.read_all", async () => {
    vi.mocked(getBranchContext).mockResolvedValue(context({ can: (permission) => permission === "session.read_all" }));

    await expect(historialScopeForSession()).resolves.toEqual({
      userId: "user-1",
      branchId: "branch-1",
    });
  });

  it("restricts to the owner's own sessions without session.read_all", async () => {
    await expect(historialScopeForSession()).resolves.toEqual({
      userId: "user-1",
      branchId: "branch-1",
      ownerId: "user-1",
    });
  });

  it("always carries the active branch, even for a master", async () => {
    vi.mocked(getBranchContext).mockResolvedValue(
      context({
        user: session({ isMaster: true, role: "admin" }),
        isMaster: true,
        can: () => true,
      }),
    );

    await expect(historialScopeForSession()).resolves.toEqual({
      userId: "user-1",
      branchId: "branch-1",
    });
  });
});
