import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool } from "pg";

const globals = globalThis as unknown as { __parkingPool?: Pool };

async function loadClient() {
  vi.resetModules();
  return await import("@/lib/db/client");
}

function fakePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ id: "row-1" }] }),
    on: vi.fn(),
  } as unknown as Pool;
}

beforeEach(() => {
  vi.resetModules();
  delete globals.__parkingPool;
  vi.stubEnv("DATABASE_URL", "postgres://test@localhost:5432/test");
  vi.stubEnv("DATABASE_SCHEMA", undefined);
});

afterEach(() => {
  delete globals.__parkingPool;
  vi.unstubAllEnvs();
});

describe("pool construction", () => {
  it("uses the public schema and a small pool by default", async () => {
    const { pool } = await loadClient();

    expect(pool.options.max).toBe(5);
    expect(pool.options.idleTimeoutMillis).toBe(30_000);
    expect(pool.options.connectionString).toBe("postgres://test@localhost:5432/test");
    // No search_path override on the boot packet for the public schema.
    expect((pool.options as { options?: string }).options).toBeUndefined();
    expect(globals.__parkingPool).toBe(pool);

    await pool.end();
  });

  it("injects the schema through the connection options packet", async () => {
    vi.stubEnv("DATABASE_SCHEMA", "dev");

    const { pool } = await loadClient();

    expect((pool.options as { options?: string }).options).toBe(
      "-c search_path=dev,public",
    );

    await pool.end();
  });

  it("accepts mixed-case schema names", async () => {
    vi.stubEnv("DATABASE_SCHEMA", "Dev_QA");

    const { pool } = await loadClient();

    expect((pool.options as { options?: string }).options).toBe(
      "-c search_path=Dev_QA,public",
    );

    await pool.end();
  });

  it("refuses an invalid schema identifier at import time", async () => {
    vi.stubEnv("DATABASE_SCHEMA", "dev; drop schema public");

    await expect(loadClient()).rejects.toThrow(
      "DATABASE_SCHEMA inválido: dev; drop schema public",
    );
  });

  it("reuses the pool cached on globalThis", async () => {
    const shared = fakePool();
    globals.__parkingPool = shared;

    const { pool } = await loadClient();

    expect(pool).toBe(shared);
  });

  it("registers an error listener that logs the idle client failure", async () => {
    const { pool } = await loadClient();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handlers = pool.listeners("error") as ((err: Error) => void)[];
    expect(handlers).toHaveLength(1);
    handlers[0]!(new Error("terminating connection"));

    expect(errorSpy).toHaveBeenCalledWith(
      "[db] idle client error:",
      "terminating connection",
    );

    await pool.end();
  });
});

describe("query", () => {
  it("returns the rows array produced by the pool", async () => {
    const shared = fakePool();
    globals.__parkingPool = shared;
    const { query } = await loadClient();

    const rows = await query("SELECT 1", [7]);

    expect(rows).toEqual([{ id: "row-1" }]);
    expect(shared.query).toHaveBeenCalledWith("SELECT 1", [7]);
  });

  it("delegates to the shared pool with the exact arguments", async () => {
    const shared = fakePool();
    globals.__parkingPool = shared;
    const { query } = await loadClient();

    await query("SELECT $1::int", [42]);

    expect(shared.query).toHaveBeenCalledWith("SELECT $1::int", [42]);
  });

  it("passes undefined params through untouched", async () => {
    const shared = fakePool();
    globals.__parkingPool = shared;
    const { query } = await loadClient();

    await query("SELECT now()");

    expect(shared.query).toHaveBeenCalledWith("SELECT now()", undefined);
  });

  it("propagates pool errors to the caller", async () => {
    const shared = fakePool();
    vi.mocked(shared.query).mockRejectedValue(new Error("pool exhausted"));
    globals.__parkingPool = shared;
    const { query } = await loadClient();

    await expect(query("SELECT 1")).rejects.toThrow("pool exhausted");
  });
});
