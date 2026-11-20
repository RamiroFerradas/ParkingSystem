import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/sessions/move/route";
import { getBranchContextOrFail } from "@/lib/auth/context";
import { pool } from "@/lib/db/client";

const { connectMock } = vi.hoisted(() => ({ connectMock: vi.fn() }));

vi.mock("@/lib/auth/context", () => ({ getBranchContextOrFail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn(), pool: { connect: connectMock } }));

const mockContext = vi.mocked(getBranchContextOrFail);

const context = {
  user: {
    userId: "user-1",
    email: "empleado@parking.test",
    name: "Empleado",
    role: "employee" as const,
    branchId: "branch-1",
    branchName: "Central",
    isMaster: false,
  },
  branchId: "branch-1",
  branchName: "Central",
  role: "employee" as const,
  isMaster: false,
  memberships: [],
  can: () => true,
};

const session = {
  id: "session-1",
  ticket_number: "42",
  box_id: "box-old",
  box_number: "A1",
  plate: "AB123CD",
  status: "open",
};

const box = { id: "box-new", number: "B2", is_active: true, is_service_enabled: true };

interface TxState {
  session?: Record<string, unknown>;
  box?: Record<string, unknown>;
  busy?: boolean;
  failOnUpdate?: Error;
}

function makeClient(state: TxState) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("FOR UPDATE OF s")) {
        return state.session
          ? { rows: [state.session], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (text.includes("SELECT id, number, is_active, is_service_enabled")) {
        return state.box ? { rows: [state.box], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (text.includes("status = 'open' AND id <> $2")) {
        return { rows: state.busy ? [{ one: 1 }] : [], rowCount: state.busy ? 1 : 0 };
      }
      if (text.startsWith("UPDATE parking_sessions") && state.failOnUpdate) {
        throw state.failOnUpdate;
      }
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  return { client, calls };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/sessions/move", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

let tx: ReturnType<typeof makeClient>;

function useClient(state: TxState) {
  tx = makeClient(state);
  connectMock.mockResolvedValue(tx.client);
  return tx;
}

beforeEach(() => {
  mockContext.mockResolvedValue({ context, error: null });
  useClient({ session, box });
});

describe("POST /api/sessions/move", () => {
  it("moves an open session and returns the new box", async () => {
    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sessionId: "session-1",
      ticketNumber: 42,
      boxId: "box-new",
      boxNumber: "B2",
      plate: "AB123CD",
    });

    const texts = tx.calls.map((c) => c.text.trim());
    expect(texts[0]).toBe("BEGIN");
    expect(texts.at(-1)).toBe("COMMIT");
    expect(texts.some((t) => t.startsWith("INSERT INTO sync_outbox"))).toBe(true);
    expect(texts.some((t) => t.startsWith("INSERT INTO audit_logs"))).toBe(true);
    expect(tx.client.release).toHaveBeenCalledTimes(1);

    const update = tx.calls.find((c) => c.text.startsWith("UPDATE parking_sessions"));
    expect(update?.params).toEqual(["box-new", "session-1"]);
    expect(mockContext).toHaveBeenCalledWith("session.open");
  });

  it("returns 401 without a session and never opens a client", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 401, body: { error: "Sesión requerida" } },
    });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks session.open", async () => {
    mockContext.mockResolvedValueOnce({
      context: null,
      error: { status: 403, body: { error: "Acceso restringido" } },
    });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Acceso restringido" });
  });

  it("rejects an unparsable body with 400", async () => {
    const res = await post("{no-json");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cuerpo inválido" });
  });

  it("requires sessionId and boxId as strings", async () => {
    const res = await post({ sessionId: "session-1" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Faltan datos del movimiento" });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns 404 and rolls back when the session is not in the branch", async () => {
    useClient({ box });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Estadía no encontrada" });
    expect(tx.calls.map((c) => c.text)).toContain("ROLLBACK");
    expect(tx.client.release).toHaveBeenCalledTimes(1);
  });

  it("refuses to move an already closed session", async () => {
    useClient({ session: { ...session, status: "closed" }, box });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "La estadía ya está cerrada" });
  });

  it("returns 404 when the target box does not exist", async () => {
    useClient({ session });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Box inexistente" });
  });

  it("rejects an inactive box", async () => {
    useClient({ session, box: { ...box, is_active: false } });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "El box B2 está dado de baja" });
  });

  it("rejects a box that is out of service", async () => {
    useClient({ session, box: { ...box, is_service_enabled: false } });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "El box B2 está fuera de servicio",
    });
  });

  it("reports when the vehicle is already in the requested box", async () => {
    useClient({ session, box: { ...box, id: "box-old", number: "A1" } });

    const res = await post({ sessionId: "session-1", boxId: "box-old" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "La patente AB123CD ya está en el box A1",
    });
  });

  it("rejects a box that already holds another open session", async () => {
    useClient({ session, box, busy: true });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "El box B2 ya está ocupado" });
  });

  it("rolls back and maps an unexpected failure to 400", async () => {
    useClient({ session, box, failOnUpdate: new Error("deadlock detected") });

    const res = await post({ sessionId: "session-1", boxId: "box-new" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "deadlock detected" });
    expect(tx.calls.map((c) => c.text)).toContain("ROLLBACK");
    expect(tx.client.release).toHaveBeenCalledTimes(1);
  });

  it("waits for a pool client from the shared pool", async () => {
    await post({ sessionId: "session-1", boxId: "box-new" });

    expect(vi.mocked(pool.connect)).toHaveBeenCalledTimes(1);
  });
});
