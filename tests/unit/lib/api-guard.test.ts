import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));

import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { requireUser, rpcErrorResponse } from "@/lib/api/guard";

const user: SessionUser = {
  userId: "u1",
  email: "op@parking.test",
  name: "Operador",
  role: "employee",
  branchId: "b1",
  branchName: "Centro",
  isMaster: false,
};

beforeEach(() => {
  vi.mocked(getSessionUser).mockResolvedValue(user);
});

describe("requireUser", () => {
  it("returns a 401 NextResponse when there is no session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const result = await requireUser();

    expect(result.user).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
    await expect(result.error!.json()).resolves.toEqual({
      error: "Sesión requerida",
    });
  });

  it("returns the session user and no error when the cookie is valid", async () => {
    const result = await requireUser();

    expect(result.error).toBeNull();
    expect(result.user).toEqual(user);
  });
});

describe("rpcErrorResponse", () => {
  it("maps every actor foreign key to a 401 re-login message", async () => {
    const actorFks = [
      "vehicles_created_by_fkey",
      "parking_sessions_opened_by_fkey",
      "payments_registered_by_fkey",
      "cash_shifts_opened_by_fkey",
      "audit_logs_actor_id_fkey",
    ];

    for (const fk of actorFks) {
      const res = rpcErrorResponse(
        new Error(`insert or update violates foreign key constraint "${fk}"`),
      );
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: "Tu sesión ya no es válida. Volvé a iniciar sesión.",
      });
    }
  });

  it("keeps a non-actor foreign key error as a 400 with the raw message", async () => {
    const message =
      'insert or update on table "payments" violates foreign key constraint "payments_session_id_fkey"';

    const res = rpcErrorResponse(new Error(message));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: message });
  });

  it("returns the error message verbatim for other database errors", async () => {
    const res = rpcErrorResponse(new Error("No hay caja abierta"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No hay caja abierta" });
  });

  it("falls back to 'Error interno' for non-Error values", async () => {
    const res = rpcErrorResponse({ code: "XX000" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Error interno" });
  });
});
