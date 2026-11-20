import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

import { query } from "@/lib/db/client";
import {
  loadFilterOptions,
  loadHistorial,
  loadHistorialAll,
  parseHistorialFilters,
} from "@/lib/queries/historial";

const dbQuery = vi.mocked(query) as unknown as Mock;

/** Collapse SQL whitespace so the expectations survive formatting-only changes. */
const n = (sql: string) => sql.replace(/\s+/g, " ").trim();

const UUID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  dbQuery.mockResolvedValue([]);
});

describe("parseHistorialFilters", () => {
  it("keeps only well-formed ISO dates", () => {
    expect(parseHistorialFilters({ from: "2026-01-31", to: "2026-1-1" })).toEqual({
      from: "2026-01-31",
    });
    expect(parseHistorialFilters({ from: "31/01/2026" })).toEqual({});
    expect(parseHistorialFilters({ from: "" })).toEqual({});
  });

  it("rejects impossible calendar dates instead of forwarding them", () => {
    // Previously the shape check alone let 2026-13-01 reach the ::date cast.
    expect(parseHistorialFilters({ from: "2026-13-01" })).toEqual({});
    expect(parseHistorialFilters({ to: "2026-01-32" })).toEqual({});
    expect(parseHistorialFilters({ from: "2026-02-30" })).toEqual({});
    expect(parseHistorialFilters({ to: "2025-02-29" })).toEqual({});
  });

  it("accepts real calendar dates, including leap days", () => {
    expect(parseHistorialFilters({ from: "2024-02-29" })).toEqual({ from: "2024-02-29" });
    expect(parseHistorialFilters({ to: "2026-12-31" })).toEqual({ to: "2026-12-31" });
  });

  it("trims and uppercases the plate", () => {
    expect(parseHistorialFilters({ plate: "  ab123cd  " })).toEqual({ plate: "AB123CD" });
    expect(parseHistorialFilters({ plate: "   " })).toEqual({});
  });

  it("takes the first value of repeated search params", () => {
    expect(
      parseHistorialFilters({ plate: ["aa111aa", "bb222bb"], status: ["open", "closed"] }),
    ).toEqual({ plate: "AA111AA", status: "open" });
  });

  it("accepts only open/closed statuses", () => {
    expect(parseHistorialFilters({ status: "closed" })).toEqual({ status: "closed" });
    expect(parseHistorialFilters({ status: "cancelled" })).toEqual({});
  });

  it("validates the id filters by the 36-char UUID pattern", () => {
    expect(
      parseHistorialFilters({
        typeId: UUID,
        boxId: UUID.toUpperCase(),
        employeeId: UUID,
        methodId: UUID,
      }),
    ).toEqual({ typeId: UUID, boxId: UUID.toUpperCase(), employeeId: UUID, methodId: UUID });

    expect(parseHistorialFilters({ typeId: "box-1" })).toEqual({});
    expect(parseHistorialFilters({ typeId: `${UUID}0` })).toEqual({});
  });

  it("rejects a hyphens-only string that is 36 characters long", () => {
    // The old pattern accepted any 36 hex/hyphen characters, so this reached
    // the ::uuid cast and Postgres raised instead of the filter being ignored.
    expect(parseHistorialFilters({ boxId: "-".repeat(36) })).toEqual({});
    expect(parseHistorialFilters({ typeId: UUID.replace(/-/g, "") })).toEqual({});
    expect(parseHistorialFilters({ methodId: "1111111-2222-3333-4444-555555555555" })).toEqual(
      {},
    );
  });

  it("ignores unknown keys", () => {
    expect(parseHistorialFilters({ foo: "bar" })).toEqual({});
  });
});

describe("loadHistorial", () => {
  it("builds the full SELECT with no WHERE and the default LIMIT", async () => {
    await loadHistorial({});

    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(n(sql)).toBe(
      n(`
        SELECT s.id,
               s.ticket_number::text AS ticket_number,
               v.plate,
               vt.name AS vehicle_type_name,
               b.number AS box_number,
               s.entry_at,
               s.exit_at,
               s.status,
               s.duration_minutes,
               s.final_amount_cents::text AS final_amount_cents,
               pc.email AS closed_by_name
          FROM parking_sessions s
          JOIN vehicles v       ON v.id = s.vehicle_id
          JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
          JOIN parking_boxes b  ON b.id = s.box_id
          LEFT JOIN profiles pc ON pc.id = s.closed_by
          ORDER BY s.entry_at DESC
          LIMIT 500
      `),
    );
    expect(params).toEqual([]);
  });

  it("numbers every filter clause in declaration order", async () => {
    const filters = {
      from: "2026-01-01",
      to: "2026-01-31",
      plate: "AB123CD",
      typeId: UUID,
      boxId: UUID,
      employeeId: UUID,
      methodId: UUID,
      status: "closed",
    };

    await loadHistorial(filters, 500, { ownerId: "owner-1" });

    const [sql, params] = dbQuery.mock.calls[0]!;
    const text = n(sql);
    const where = text.slice(text.indexOf(" WHERE ") + " WHERE ".length);
    expect(where).toBe(
      n(`
        s.opened_by = $1::uuid
        AND (s.entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date >= $2::date
        AND (s.entry_at AT TIME ZONE 'America/Argentina/Cordoba')::date <= $3::date
        AND v.plate ILIKE $4
        AND s.vehicle_type_id = $5::uuid
        AND s.box_id = $6::uuid
        AND s.closed_by = $7::uuid
        AND EXISTS (SELECT 1 FROM payments p WHERE p.session_id = s.id AND p.method_id = $8::uuid)
        AND s.status = $9
        ORDER BY s.entry_at DESC LIMIT 500
      `),
    );
    expect(params).toEqual([
      "owner-1",
      "2026-01-01",
      "2026-01-31",
      "%AB123CD%",
      UUID,
      UUID,
      UUID,
      UUID,
      "closed",
    ]);
  });

  it("applies the owner scope on its own", async () => {
    await loadHistorial({}, 500, { ownerId: "emp-9" });

    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(n(sql)).toContain("WHERE s.opened_by = $1::uuid");
    expect(params).toEqual(["emp-9"]);
  });

  it("interpolates a numeric limit without binding it", async () => {
    await loadHistorial({}, 25);

    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(n(sql)).toContain("LIMIT 25");
    expect(params).toEqual([]);
  });

  it("returns the mapped rows from the pool", async () => {
    const row = {
      id: "s-1",
      ticket_number: "42",
      plate: "AB123CD",
      vehicle_type_name: "Auto",
      box_number: "7",
      entry_at: "2026-01-15T13:00:00.000Z",
      exit_at: null,
      status: "open",
      duration_minutes: null,
      final_amount_cents: null,
      closed_by_name: null,
    };
    dbQuery.mockResolvedValue([row]);

    await expect(loadHistorial({})).resolves.toEqual([row]);
  });
});

describe("loadHistorialAll", () => {
  it("omits the LIMIT clause", async () => {
    await loadHistorialAll({});

    const [sql] = dbQuery.mock.calls[0]!;
    expect(n(sql)).not.toContain("LIMIT");
    expect(n(sql)).toMatch(/ORDER BY s\.entry_at DESC$/);
  });

  it("shares the filter builder with loadHistorial", async () => {
    await loadHistorialAll({ plate: "ab123cd", status: "open" });

    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(n(sql)).toContain("WHERE v.plate ILIKE $1 AND s.status = $2");
    expect(params).toEqual(["%ab123cd%", "open"]);
  });
});

describe("loadFilterOptions", () => {
  it("loads the four option lists in parallel", async () => {
    dbQuery
      .mockResolvedValueOnce([{ id: "t1", name: "Auto" }])
      .mockResolvedValueOnce([{ id: "b1", number: "1" }])
      .mockResolvedValueOnce([{ id: "u1", full_name: "Operador" }])
      .mockResolvedValueOnce([{ id: "m1", name: "Efectivo" }]);

    await expect(loadFilterOptions()).resolves.toEqual({
      types: [{ id: "t1", name: "Auto" }],
      boxes: [{ id: "b1", number: "1" }],
      employees: [{ id: "u1", full_name: "Operador" }],
      methods: [{ id: "m1", name: "Efectivo" }],
    });

    const sqls = dbQuery.mock.calls.map(([sql]) => n(sql));
    expect(sqls).toEqual([
      "SELECT id, name FROM vehicle_types WHERE is_active ORDER BY sort_order",
      "SELECT id, number FROM parking_boxes ORDER BY number",
      "SELECT id, email AS full_name FROM profiles WHERE is_active ORDER BY email",
      "SELECT id, name FROM payment_methods WHERE is_active ORDER BY sort_order",
    ]);
  });

  it("passes no parameters for the option queries", async () => {
    await loadFilterOptions();

    for (const call of dbQuery.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });
});
