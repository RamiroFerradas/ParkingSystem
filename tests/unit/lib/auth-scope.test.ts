import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: vi.fn() }));

import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
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

beforeEach(() => {
  vi.mocked(getSessionUser).mockResolvedValue(session());
  vi.mocked(hasPermission).mockResolvedValue(false);
});

describe("historialScopeForSession", () => {
  it("returns null without a session and never checks permissions", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    await expect(historialScopeForSession()).resolves.toBeNull();
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it("keeps the whole branch visible with session.read_all", async () => {
    vi.mocked(hasPermission).mockResolvedValue(true);

    await expect(historialScopeForSession()).resolves.toEqual({
      userId: "user-1",
    });
  });

  it("restricts to the owner's own sessions without session.read_all", async () => {
    await expect(historialScopeForSession()).resolves.toEqual({
      userId: "user-1",
      ownerId: "user-1",
    });
  });

  it("evaluates session.read_all against the full session user", async () => {
    const master = session({ isMaster: true, role: "admin" });
    vi.mocked(getSessionUser).mockResolvedValue(master);

    await historialScopeForSession();

    expect(hasPermission).toHaveBeenCalledWith(master, "session.read_all");
  });
});
