import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, PATCH } from "@/app/api/print-jobs/route";
import { getSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockSession = vi.mocked(getSessionUser);
const mockQuery = vi.mocked(query);

const user = {
  userId: "user-1",
  email: "empleado@parking.test",
  name: "Empleado",
  role: "employee" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

const job = {
  id: "job-1",
  session_id: "session-1",
  kind: "entry",
  status: "pending",
  attempts: 0,
  last_error: null,
  created_at: "2026-01-15 09:00:00+00",
  ticket_number: "42",
  plate: "AB123CD",
};

function get(queryString = "") {
  return GET(new Request(`http://localhost/api/print-jobs${queryString}`));
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/print-jobs", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/print-jobs", {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function pgError(code: string): Error {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

beforeEach(() => {
  mockSession.mockResolvedValue(user);
  // B1 adds a scoping query, so tests queue `mockResolvedValueOnce` per call.
  // Reset first to drop unused queue entries from the previous test.
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe("GET /api/print-jobs", () => {
  it("lists the latest jobs", async () => {
    mockQuery.mockResolvedValueOnce([job]);

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ jobs: [job] });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([null, "branch-1"]);
  });

  it("filters by a valid status", async () => {
    mockQuery.mockResolvedValueOnce([job]);

    await get("?status=pending");

    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["pending", "branch-1"]);
  });

  it("rejects an unknown status with 400", async () => {
    const res = await get("?status=bogus");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Estado inválido" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
  });

  it("maps a database failure to 400", async () => {
    mockQuery.mockRejectedValueOnce(new Error("timeout"));

    const res = await get();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "timeout" });
  });
});

describe("POST /api/print-jobs", () => {
  it("queues an entry ticket without an audit entry", async () => {
    // B1: the handler first resolves the session's branch, so the insert is now
    // the second statement instead of the first.
    mockQuery
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockResolvedValueOnce([{ id: "job-1" }]);

    const res = await post({ sessionId: "session-1", kind: "entry" });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true, id: "job-1" });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0]?.[0]).toContain("FROM parking_sessions");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["session-1", "branch-1"]);
    expect(mockQuery.mock.calls[1]?.[0]).toContain("INSERT INTO print_jobs");
    expect(mockQuery.mock.calls[1]?.[1]).toEqual(["session-1", "entry"]);
  });

  it("rejects a session from another branch without inserting a job", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await post({ sessionId: "session-2", kind: "entry" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Estadía no encontrada" });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["session-2", "branch-1"]);
  });

  it("rejects a cross-branch reprint before writing the audit log", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await post({ sessionId: "session-2", kind: "reprint" });

    expect(res.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("ticket.reprint")),
    ).toBe(false);
  });

  it("audits a manual reprint", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: "session-1" }])
      .mockResolvedValueOnce([{ id: "job-2" }])
      .mockResolvedValueOnce([]);

    const res = await post({ sessionId: "session-1", kind: "reprint" });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true, id: "job-2" });
    expect(mockQuery.mock.calls[2]?.[0]).toContain("ticket.reprint");
    expect(mockQuery.mock.calls[2]?.[1]).toEqual(["user-1", "branch-1", "session-1"]);
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await post("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects an unknown kind with 400", async () => {
    const res = await post({ sessionId: "session-1", kind: "close" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Datos de impresión inválidos" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps a missing session foreign key to 400", async () => {
    mockQuery.mockRejectedValueOnce(pgError("23503"));

    const res = await post({ sessionId: "session-9", kind: "entry" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "La estadía indicada no existe" });
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await post({ sessionId: "session-1", kind: "entry" });

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/print-jobs", () => {
  it("marks a job as printed", async () => {
    mockQuery.mockResolvedValueOnce([{ id: "job-1" }]);

    const res = await patch({ id: "job-1", status: "printed" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // B1: the update now carries the caller's branch and only matches jobs
    // whose session belongs to it.
    expect(mockQuery.mock.calls[0]?.[0]).toContain("parking_sessions");
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(["job-1", "printed", null, "branch-1"]);
  });

  it("rejects a job from another branch with 404", async () => {
    // The scoped UPDATE matches no row when the session lives in another branch.
    mockQuery.mockResolvedValueOnce([]);

    const res = await patch({ id: "job-9", status: "printed" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Job de impresión inexistente" });
    expect(mockQuery.mock.calls[0]?.[1]?.[3]).toBe("branch-1");
  });

  it("records a truncated error message", async () => {
    mockQuery.mockResolvedValueOnce([{ id: "job-1" }]);

    await patch({ id: "job-1", status: "error", lastError: "x".repeat(400) });

    const params = mockQuery.mock.calls[0]?.[1];
    expect(params?.[2]).toHaveLength(300);
  });

  it("ignores a non-string lastError", async () => {
    mockQuery.mockResolvedValueOnce([{ id: "job-1" }]);

    await patch({ id: "job-1", status: "error", lastError: { detail: "boom" } });

    expect(mockQuery.mock.calls[0]?.[1]?.[2]).toBeNull();
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await patch("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects an unknown status with 400", async () => {
    const res = await patch({ id: "job-1", status: "queued" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Estado de impresión inválido" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown job", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await patch({ id: "job-9", status: "printed" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Job de impresión inexistente" });
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await patch({ id: "job-1", status: "printed" });

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
