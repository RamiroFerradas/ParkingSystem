import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/reports/export/route";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { query } from "@/lib/db/client";

vi.mock("@/lib/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

const mockSession = vi.mocked(getSessionUser);
const mockPermission = vi.mocked(hasPermission);
const mockQuery = vi.mocked(query);

const user = {
  userId: "user-1",
  email: "supervisor@parking.test",
  name: "Supervisor",
  role: "supervisor" as const,
  branchId: "branch-1",
  branchName: "Central",
  isMaster: false,
};

const rows = [
  { day: "2026-01-15", sessions: "4", collected: "500000", methods: 'Efectivo:300000 | "Tarjeta":200000' },
  { day: "2026-01-14", sessions: "1", collected: "100000", methods: "" },
];

function get(queryString = "") {
  return GET(new Request(`http://localhost/api/reports/export${queryString}`));
}

beforeEach(() => {
  mockSession.mockResolvedValue(user);
  mockPermission.mockResolvedValue(true);
  mockQuery.mockResolvedValue(rows);
});

describe("GET /api/reports/export", () => {
  it("exports the daily CSV for the default 30-day period", async () => {
    const res = await get();
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reporte-30.csv"');
    expect(text).toBe(
      "dia,cobros,recaudado_cents,por_medio\n" +
        '2026-01-15,4,500000,"Efectivo:300000 | \'Tarjeta\':200000"\n' +
        '2026-01-14,1,100000,""\n',
    );
    expect(mockPermission).toHaveBeenCalledWith(user, "reports.read");
  });

  it("selects the requested period and reflects it in the filename", async () => {
    const res = await get("?p=hoy");
    const text = await res.text();

    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reporte-hoy.csv"');
    expect(text).toContain("dia,cobros,recaudado_cents,por_medio");
    expect(mockQuery.mock.calls[0]?.[0]).toContain("d.day = (now() AT TIME ZONE");
  });

  it("falls back to the 30-day period for an unknown key", async () => {
    const res = await get("?p=whatever");

    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reporte-30.csv"');
    expect(mockQuery.mock.calls[0]?.[0]).toContain("interval '30 days'");
  });

  it("keeps only the header when there are no rows", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const text = await (await get()).text();

    expect(text).toBe("dia,cobros,recaudado_cents,por_medio\n\n");
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await get();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Sesión requerida" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns a plain-text 403 without reports.read", async () => {
    mockPermission.mockResolvedValueOnce(false);

    const res = await get();

    expect(res.status).toBe(403);
    await expect(res.text()).resolves.toBe("No tenés permiso");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps a database failure to 400", async () => {
    mockQuery.mockRejectedValueOnce(new Error("syntax error"));

    const res = await get();

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "syntax error" });
  });
});
