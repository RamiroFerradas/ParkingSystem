import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

type PermissionsModule = typeof import("@/lib/auth/permissions");

let dbQuery: Mock;
let permissions: PermissionsModule;

// The module keeps its role matrix in a module-level cache, so every test needs
// a fresh module instance (and a fresh db mock alongside it).
beforeEach(async () => {
  vi.resetModules();
  const db = await import("@/lib/db/client");
  dbQuery = vi.mocked(db.query) as unknown as Mock;
  permissions = await import("@/lib/auth/permissions");
});

afterEach(() => {
  vi.useRealTimers();
});

function rowsOf(matrix: Record<string, boolean>, overrides: Record<string, boolean>) {
  return (sql: string) =>
    Promise.resolve(
      sql.includes("FROM role_permissions")
        ? Object.entries(matrix).map(([key, allowed]) => {
            const [role, permission] = key.split(":");
            return { role, permission, allowed };
          })
        : Object.entries(overrides).map(([permission, allowed]) => ({
            permission,
            allowed,
          })),
    );
}

describe("loadPermissionMatrix", () => {
  it("keys the matrix by role:permission", async () => {
    dbQuery.mockResolvedValue([
      { role: "admin", permission: "*", allowed: true },
      { role: "employee", permission: "session.open", allowed: true },
      { role: "employee", permission: "session.close", allowed: false },
    ]);

    const matrix = await permissions.loadPermissionMatrix();

    expect(Array.from(matrix.entries())).toEqual([
      ["admin:*", true],
      ["employee:session.open", true],
      ["employee:session.close", false],
    ]);
    expect(dbQuery).toHaveBeenCalledWith(
      "SELECT role, permission, allowed FROM role_permissions",
    );
  });

  it("reuses the cached matrix within the 60s TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    dbQuery.mockResolvedValue([{ role: "admin", permission: "*", allowed: true }]);

    await permissions.loadPermissionMatrix();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 59));
    await permissions.loadPermissionMatrix();

    expect(dbQuery).toHaveBeenCalledTimes(1);
  });

  it("reloads the matrix once the TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    dbQuery.mockResolvedValue([{ role: "admin", permission: "*", allowed: true }]);

    await permissions.loadPermissionMatrix();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 1, 1));
    await permissions.loadPermissionMatrix();

    expect(dbQuery).toHaveBeenCalledTimes(2);
  });
});

describe("loadUserPermissionOverrides", () => {
  it("returns an empty map without querying when branchId is null", async () => {
    const map = await permissions.loadUserPermissionOverrides("u1", null);

    expect(map.size).toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("reads every branch when branchId is undefined (legacy configurator)", async () => {
    dbQuery.mockResolvedValue([
      { permission: "reports.view", allowed: true },
      { permission: "cash.close", allowed: false },
    ]);

    const map = await permissions.loadUserPermissionOverrides("u1");

    expect(Array.from(map.entries())).toEqual([
      ["reports.view", true],
      ["cash.close", false],
    ]);
    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(sql).toBe("SELECT permission, allowed FROM user_permissions WHERE user_id = $1");
    expect(params).toEqual(["u1"]);
  });

  it("scopes the read to one branch when branchId is a string", async () => {
    dbQuery.mockResolvedValue([{ permission: "cash.close", allowed: true }]);

    await permissions.loadUserPermissionOverrides("u1", "b-1");

    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(sql).toContain("AND branch_id = $2");
    expect(params).toEqual(["u1", "b-1"]);
  });
});

describe("roleHasPermission", () => {
  it("grants everything through the role wildcard", async () => {
    dbQuery.mockResolvedValue([{ role: "admin", permission: "*", allowed: true }]);

    await expect(permissions.roleHasPermission("admin", "whatever")).resolves.toBe(true);
  });

  it("matches an explicit grant and denies a missing or false entry", async () => {
    dbQuery.mockResolvedValue([
      { role: "employee", permission: "session.open", allowed: true },
      { role: "employee", permission: "session.close", allowed: false },
    ]);

    await expect(permissions.roleHasPermission("employee", "session.open")).resolves.toBe(true);
    await expect(permissions.roleHasPermission("employee", "session.close")).resolves.toBe(false);
    await expect(permissions.roleHasPermission("employee", "cash.close")).resolves.toBe(false);
  });
});

describe("hasPermission", () => {
  it("lets an explicit user override deny a role wildcard", async () => {
    dbQuery.mockImplementation(
      rowsOf({ "admin:*": true }, { "audit.view": false }),
    );

    await expect(
      permissions.hasPermission(
        { userId: "u1", role: "admin", branchId: "b-1" },
        "audit.view",
      ),
    ).resolves.toBe(false);
  });

  it("lets an explicit user override grant a permission the role lacks", async () => {
    dbQuery.mockImplementation(rowsOf({ "employee:session.open": true }, { "reports.view": true }));

    await expect(
      permissions.hasPermission(
        { userId: "u1", role: "employee", branchId: "b-1" },
        "reports.view",
      ),
    ).resolves.toBe(true);
  });

  it("falls back to the role matrix and loads both sources", async () => {
    dbQuery.mockImplementation(rowsOf({ "employee:session.open": true }, {}));

    await expect(
      permissions.hasPermission({ userId: "u1", role: "employee", branchId: "b-1" }, "session.open"),
    ).resolves.toBe(true);
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });
});

describe("permissionsFor", () => {
  it("returns an evaluator backed by a single snapshot of the matrices", async () => {
    dbQuery.mockImplementation(rowsOf({ "employee:session.open": true }, {}));

    const can = await permissions.permissionsFor({
      userId: "u1",
      role: "employee",
      branchId: "b-1",
    });

    expect(can("session.open")).toBe(true);
    expect(can("session.close")).toBe(false);
    expect(dbQuery).toHaveBeenCalledTimes(2);

    // Later database changes do not leak into the already-built evaluator.
    dbQuery.mockImplementation(rowsOf({ "employee:*": true }, {}));
    expect(can("session.close")).toBe(false);
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });
});
