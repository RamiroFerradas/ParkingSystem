import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE, PATCH } from "@/app/api/branches/[id]/route";
import { jsonRequest, makeContext, makeUser, rawRequest } from "../_support";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/db/client", () => db);

const authContext = vi.hoisted(() => ({ getBranchContext: vi.fn() }));
vi.mock("@/lib/auth/context", () => authContext);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const branchRow = { id: "branch-1", name: "Centro", code: "C", is_active: true };

beforeEach(() => {
  authContext.getBranchContext.mockResolvedValue(
    makeContext({ user: makeUser({ isMaster: true, branchId: null }) }),
  );
  db.query.mockResolvedValue([]);
});

describe("PATCH /api/branches/[id]", () => {
  const url = "http://localhost/api/branches/branch-1";

  it("returns 401 without a session", async () => {
    authContext.getBranchContext.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(url, "PATCH", { name: "X" }), params("branch-1"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 for a non-master user", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());

    const res = await PATCH(jsonRequest(url, "PATCH", { name: "X" }), params("branch-1"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso restringido" });
  });

  it("rejects a malformed JSON body", async () => {
    const res = await PATCH(rawRequest(url, "PATCH", "{"), params("branch-1"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("rejects a blank name", async () => {
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "  " }), params("branch-1"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "El nombre es obligatorio" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 404 when the branch does not exist", async () => {
    db.query.mockResolvedValue([]);

    const res = await PATCH(jsonRequest(url, "PATCH", { isActive: false }), params("branch-1"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Sucursal inexistente" });
  });

  it("updates name, code and active flag", async () => {
    db.query.mockResolvedValue([branchRow]);

    const res = await PATCH(
      jsonRequest(url, "PATCH", { name: "  Centro  ", code: "  ", isActive: false }),
      params("branch-1"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, branch: branchRow });
    const call = db.query.mock.calls[0];
    expect(String(call?.[0])).toContain("name = $2");
    expect(String(call?.[0])).toContain("code = $3");
    expect(String(call?.[0])).toContain("is_active = $4");
    expect(call?.[1]).toEqual(["branch-1", "Centro", null, false]);
  });

  it("returns 409 on a duplicated name or code", async () => {
    db.query.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "uq_branches_code"'),
    );

    const res = await PATCH(jsonRequest(url, "PATCH", { code: "C" }), params("branch-1"));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya existe una sucursal con ese nombre o código.",
    });
  });

  it("maps any other database error to a generic 400", async () => {
    db.query.mockRejectedValue(new Error("boom"));

    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Otro" }), params("branch-1"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No se pudo actualizar" });
  });
});

describe("DELETE /api/branches/[id]", () => {
  const url = "http://localhost/api/branches/branch-1";
  const emptyCounts = { boxes: 0, sessions: 0, shifts: 0, tariffs: 0, members: 0 };

  it("returns 401 without a session", async () => {
    authContext.getBranchContext.mockResolvedValue(null);

    const res = await DELETE(new Request(url), params("branch-1"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesión requerida" });
  });

  it("returns 403 for a non-master user", async () => {
    authContext.getBranchContext.mockResolvedValue(makeContext());

    const res = await DELETE(new Request(url), params("branch-1"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso restringido" });
  });

  it("returns 404 when the branch does not exist", async () => {
    db.query.mockResolvedValue([]);

    const res = await DELETE(new Request(url), params("branch-1"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Sucursal inexistente" });
  });

  it("refuses to delete a branch that still has data", async () => {
    db.query.mockResolvedValueOnce([{ ...emptyCounts, sessions: 3 }]);

    const res = await DELETE(new Request(url), params("branch-1"));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error:
        "La sucursal tiene datos (boxes, estadías, turnos, tarifas o usuarios). Desactivala en vez de eliminarla.",
      counts: { ...emptyCounts, sessions: 3 },
    });
    expect(
      db.query.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM branches")),
    ).toBe(false);
  });

  it("refuses to delete the last remaining branch", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("AS boxes")) return [emptyCounts];
      if (sql.includes("count(*)::int AS n FROM branches")) return [{ n: 0 }];
      return [];
    });

    const res = await DELETE(new Request(url), params("branch-1"));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Tiene que quedar al menos una sucursal." });
  });

  it("deletes an empty branch when others remain", async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("AS boxes")) return [emptyCounts];
      if (sql.includes("count(*)::int AS n FROM branches")) return [{ n: 1 }];
      return [];
    });

    const res = await DELETE(new Request(url), params("branch-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = db.query.mock.calls.find(([sql]) => String(sql).includes("DELETE FROM branches"));
    expect(del?.[1]).toEqual(["branch-1"]);
  });
});
