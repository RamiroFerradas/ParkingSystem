import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/branches/route";
import { jsonRequest, makeContext, makeUser, pgError, rawRequest } from "./_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const authContext = vi.hoisted(() => ({ getBranchContext: vi.fn() }));
vi.mock("@/lib/auth/context", () => authContext);

beforeEach(() => {
  authContext.getBranchContext.mockResolvedValue(
    makeContext({ user: makeUser({ isMaster: true, branchId: null }) }),
  );
  db.query.mockResolvedValue([]);
});

describe("GET /api/branches", () => {
  it("returns 401 without a session", async () => {
    authContext.getBranchContext.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 for a non-master user", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());

    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso restringido" });
  });

  it("lists every branch for a master", async () => {
    const rows = [
      { id: "b1", name: "Centro", code: "C", is_active: true, created_at: "2026-01-01" },
    ];
    db.query.mockResolvedValue(rows);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ branches: rows });
  });
});

describe("POST /api/branches", () => {
  const url = "http://localhost/api/branches";

  it("returns 401 without a session", async () => {
    authContext.getBranchContext.mockResolvedValue(null);

    const res = await POST(jsonRequest(url, "POST", { name: "Nueva" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 for a non-master user", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());

    const res = await POST(jsonRequest(url, "POST", { name: "Nueva" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso restringido" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await POST(rawRequest(url, "POST", "{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("requires a non-empty name", async () => {
    const res = await POST(jsonRequest(url, "POST", { name: "   ", code: "X" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El nombre es obligatorio" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("creates the branch and its ticket sequence", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO branches")) return [{ id: "b9", name: "Nueva" }];
      return [];
    });

    const res = await POST(
      jsonRequest(url, "POST", { name: "  Nueva  ", code: " NV " }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, branch: { id: "b9", name: "Nueva" } });
    const insert = db.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO branches"));
    expect(insert?.[1]).toEqual(["Nueva", "NV"]);
    const sequence = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO ticket_sequences"),
    );
    expect(sequence?.[1]).toEqual(["b9"]);
  });

  it("returns 400 when the insert yields no row", async () => {
    db.query.mockResolvedValue([]);

    const res = await POST(jsonRequest(url, "POST", { name: "Nueva" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No se pudo crear la sucursal" });
  });

  it("returns 409 on a duplicated name or code", async () => {
    db.query.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "uq_branches_name"'),
    );

    const res = await POST(jsonRequest(url, "POST", { name: "Centro" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya existe una sucursal con ese nombre o código.",
    });
  });

  it("maps any other database error to a generic 400", async () => {
    db.query.mockRejectedValue(pgError("08006", "connection failure"));

    const res = await POST(jsonRequest(url, "POST", { name: "Centro" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No se pudo crear la sucursal" });
  });
});
