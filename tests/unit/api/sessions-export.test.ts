import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/sessions/export/route";
import { requireUser } from "@/lib/api/guard";
import { historialScopeForSession } from "@/lib/auth/scope";
import { loadHistorialAll } from "@/lib/queries/historial";

vi.mock("@/lib/api/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/scope", () => ({ historialScopeForSession: vi.fn() }));
vi.mock("@/lib/queries/historial", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/historial")>();
  return { ...actual, loadHistorialAll: vi.fn() };
});

const mockRequireUser = vi.mocked(requireUser);
const mockScope = vi.mocked(historialScopeForSession);
const mockLoad = vi.mocked(loadHistorialAll);

const user = {
  userId: "user-1",
  email: "empleado@parking.test",
  name: "Empleado",
  role: "employee" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

const row = {
  id: "session-1",
  ticket_number: "42",
  plate: "AB123CD",
  vehicle_type_name: "Auto",
  box_number: "A1",
  entry_at: "2026-01-15 09:00:00+00",
  exit_at: "2026-01-15 11:30:00+00",
  status: "closed",
  duration_minutes: 150,
  final_amount_cents: "125000",
  closed_by_name: "Empleado",
};

function get(queryString = "") {
  return GET(new Request(`http://localhost/api/sessions/export${queryString}`));
}

/** Response.text() drops the BOM per spec, so read it from the raw bytes. */
async function readCsv(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder().decode(bytes.subarray(hasBom ? 3 : 0));
  return { hasBom, text };
}

beforeEach(() => {
  mockRequireUser.mockResolvedValue({ user, error: null });
  mockScope.mockResolvedValue({ userId: "user-1" });
  mockLoad.mockResolvedValue([row]);
});

describe("GET /api/sessions/export", () => {
  it("streams a BOM-prefixed CSV with the history header", async () => {
    const res = await get();
    const { hasBom, text } = await readCsv(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="historial-\d{8}\.csv"$/,
    );
    expect(hasBom).toBe(true);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe(
      "ticket;ingreso;egreso;patente;tipo;box;duracion_min;cerro;estado;monto_cents",
    );
    expect(lines[1]).toBe(
      "42;2026-01-15 09:00:00+00;2026-01-15 11:30:00+00;AB123CD;Auto;A1;150;Empleado;closed;125000",
    );
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("leaves empty cells for null columns", async () => {
    mockLoad.mockResolvedValueOnce([
      {
        ...row,
        plate: null,
        exit_at: null,
        duration_minutes: null,
        closed_by_name: null,
        final_amount_cents: null,
        status: "open",
      },
    ]);

    const text = (await readCsv(await get())).text;

    expect(text).toContain("42;2026-01-15 09:00:00+00;;;Auto;A1;;;open;");
  });

  it("quotes and doubles separators, quotes and newlines", async () => {
    mockLoad.mockResolvedValueOnce([
      { ...row, plate: 'A"B;C', closed_by_name: "line1\nline2" },
    ]);

    const text = await (await get()).text();

    expect(text).toContain('"A""B;C"');
    expect(text).toContain('"line1\nline2"');
  });

  it("parses and forwards the history filters with the session scope", async () => {
    await get("?from=2026-01-01&to=2026-01-31&status=open&plate=ab123cd&bad=1");

    expect(mockLoad).toHaveBeenCalledWith(
      {
        from: "2026-01-01",
        to: "2026-01-31",
        plate: "AB123CD",
        status: "open",
      },
      { userId: "user-1" },
    );
  });

  it("returns the 401 response from the guard", async () => {
    mockRequireUser.mockResolvedValueOnce({
      user: null,
      error: NextResponse.json({ error: "Sesión requerida" }, { status: 401 }),
    });

    const res = await get();

    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("returns 401 when the session scope cannot be resolved", async () => {
    mockScope.mockResolvedValueOnce(null);

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión inválida" });
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("emits only the header when there are no rows", async () => {
    mockLoad.mockResolvedValueOnce([]);

    const { hasBom, text } = await readCsv(await get());

    expect(hasBom).toBe(true);
    expect(text).toBe(
      "ticket;ingreso;egreso;patente;tipo;box;duracion_min;cerro;estado;monto_cents\r\n",
    );
  });
});
