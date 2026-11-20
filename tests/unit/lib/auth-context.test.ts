import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ permissionsFor: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
import { query } from "@/lib/db/client";
import { redirect } from "next/navigation";
import {
  getBranchContext,
  getBranchContextOrFail,
  requireBranchContext,
} from "@/lib/auth/context";

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

const can = vi.fn<(permission: string) => boolean>();

beforeEach(() => {
  vi.mocked(getSessionUser).mockResolvedValue(session());
  vi.mocked(query).mockResolvedValue([] as never);
  vi.mocked(permissionsFor).mockResolvedValue(can);
  can.mockReturnValue(false);
});

describe("getBranchContext", () => {
  it("returns null without a session and does not touch the database", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    await expect(getBranchContext()).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(permissionsFor).not.toHaveBeenCalled();
  });

  it("gives a master every active branch and an unconditional can()", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      session({ isMaster: true, role: "admin", branchId: "b-2", branchName: "Norte" }),
    );
    vi.mocked(query).mockResolvedValue([
      { id: "b-1", name: "Centro" },
      { id: "b-2", name: "Norte" },
    ] as never);

    const ctx = await getBranchContext();

    expect(ctx!.isMaster).toBe(true);
    expect(ctx!.branchId).toBe("b-2");
    expect(ctx!.branchName).toBe("Norte");
    expect(ctx!.role).toBe("admin");
    expect(ctx!.memberships).toEqual([
      { branchId: "b-1", branchName: "Centro", role: "admin" },
      { branchId: "b-2", branchName: "Norte", role: "admin" },
    ]);
    // A master can do everything even when no branch is selected.
    expect(ctx!.can("anything.at.all")).toBe(true);
    expect(permissionsFor).not.toHaveBeenCalled();
    const [sql] = vi.mocked(query).mock.calls[0]!;
    expect(sql).toContain("FROM branches WHERE is_active = true ORDER BY name");
  });

  it("loads an employee's memberships and permission evaluator", async () => {
    vi.mocked(query).mockResolvedValue([
      { branch_id: "branch-1", name: "Centro", role: "supervisor" },
    ] as never);
    can.mockReturnValue(true);

    const ctx = await getBranchContext();

    expect(ctx!.isMaster).toBe(false);
    expect(ctx!.role).toBe("employee");
    expect(ctx!.memberships).toEqual([
      { branchId: "branch-1", branchName: "Centro", role: "supervisor" },
    ]);
    expect(permissionsFor).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(ctx!.can).toBe(can);
    expect(ctx!.can("session.read_all")).toBe(true);

    const [sql, params] = vi.mocked(query).mock.calls[0]!;
    expect(sql).toContain("FROM user_branches ub");
    expect(sql).toContain("WHERE ub.user_id = $1");
    expect(params).toEqual(["user-1"]);
  });

  it("reports a null role when the employee has no active branch", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(
      session({ branchId: null, branchName: null, role: "employee" }),
    );

    const ctx = await getBranchContext();

    expect(ctx!.branchId).toBeNull();
    expect(ctx!.role).toBeNull();
  });
});

describe("requireBranchContext", () => {
  it("redirects to the login page when there is no context", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(requireBranchContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?expired=1");
  });

  it("returns the context when the session is valid", async () => {
    const ctx = await requireBranchContext();

    expect(ctx.user.userId).toBe("user-1");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("getBranchContextOrFail", () => {
  it("fails with 401 when there is no session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    await expect(getBranchContextOrFail()).resolves.toEqual({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });
  });

  it("fails with 403 when no branch is selected", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(session({ branchId: null }));

    await expect(getBranchContextOrFail()).resolves.toEqual({
      context: null,
      error: { status: 403, body: { error: "Seleccioná una sucursal" } },
    });
  });

  it("fails with 403 when the requested permission is denied", async () => {
    can.mockReturnValue(false);

    const result = await getBranchContextOrFail("session.close");

    expect(result.error).toEqual({
      status: 403,
      body: { error: "Acceso restringido" },
    });
    expect(can).toHaveBeenCalledWith("session.close");
  });

  it("returns the context with a non-null branchId on success", async () => {
    const result = await getBranchContextOrFail();

    expect(result.error).toBeNull();
    expect(result.context!.branchId).toBe("branch-1");
    expect(result.context!.user.userId).toBe("user-1");
  });

  it("does not evaluate a permission when none is requested", async () => {
    await getBranchContextOrFail();

    expect(can).not.toHaveBeenCalled();
  });
});
