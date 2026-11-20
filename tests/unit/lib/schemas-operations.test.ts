import { describe, expect, it } from "vitest";
import {
  closeSessionSchema,
  closeShiftSchema,
  createPrintJobSchema,
  moveSessionSchema,
  openSessionSchema,
  openShiftSchema,
  updatePrintJobSchema,
  type OpenSessionPayload,
} from "@/lib/schemas/operations";

const openBody = {
  sessionId: "session-1",
  plate: "ab 123 cd",
  vehicleTypeId: "type-1",
  boxId: "box-1",
  notes: "  con notas  ",
  keyLeft: true,
  damageNotes: "  rayón puerta  ",
};

describe("openSessionSchema", () => {
  it("keeps the raw fields the route normalizes later", () => {
    const payload: OpenSessionPayload = openSessionSchema.parse(openBody);

    expect(payload.sessionId).toBe("session-1");
    expect(payload.plate).toBe("ab 123 cd");
    expect(payload.notes).toBe("  con notas  ");
    expect(payload.keyLeft).toBe(true);
    expect(payload.damageNotes).toBe("  rayón puerta  ");
  });

  it("requires the four identifying strings", () => {
    expect(openSessionSchema.safeParse({ ...openBody, vehicleTypeId: 7 }).success).toBe(false);
    expect(openSessionSchema.safeParse({ ...openBody, sessionId: undefined }).success).toBe(false);
    expect(openSessionSchema.safeParse({}).success).toBe(false);
  });

  it("ignores wrong-typed optional fields instead of rejecting them", () => {
    const payload = openSessionSchema.parse({
      ...openBody,
      notes: 5,
      keyLeft: "true",
      damageNotes: { detail: "boom" },
    });

    expect(payload.notes).toBeUndefined();
    expect(payload.keyLeft).toBeUndefined();
    expect(payload.damageNotes).toBeUndefined();
  });

  it("does not truncate damage notes; the route still slices them", () => {
    const payload = openSessionSchema.parse({ ...openBody, damageNotes: "x".repeat(600) });

    expect(payload.damageNotes).toHaveLength(600);
  });
});

describe("closeSessionSchema", () => {
  it("requires session and payment method, and accepts optional notes", () => {
    expect(closeSessionSchema.safeParse({ sessionId: "s", methodId: "m" }).success).toBe(true);
    expect(closeSessionSchema.safeParse({ sessionId: "s" }).success).toBe(false);
    expect(closeSessionSchema.safeParse({ sessionId: 1, methodId: "m" }).success).toBe(false);
  });

  it("ignores a wrong-typed notes field", () => {
    const payload = closeSessionSchema.parse({ sessionId: "s", methodId: "m", notes: ["n"] });

    expect(payload.notes).toBeUndefined();
  });
});

describe("moveSessionSchema", () => {
  it("requires both ids", () => {
    expect(moveSessionSchema.safeParse({ sessionId: "s", boxId: "b" }).success).toBe(true);
    expect(moveSessionSchema.safeParse({ sessionId: "s" }).success).toBe(false);
    expect(moveSessionSchema.safeParse({ sessionId: "s", boxId: null }).success).toBe(false);
  });
});

describe("shift schemas", () => {
  const cases = [
    ["openShiftSchema", openShiftSchema],
    ["closeShiftSchema", closeShiftSchema],
  ] as const;

  for (const [name, schema] of cases) {
    describe(name, () => {
      it("accepts an absent body and empty notes", () => {
        expect(schema.parse({}).notes).toBeUndefined();
        expect(schema.parse({ notes: "" }).notes).toBe("");
        expect(schema.parse({ notes: "turno mañana" }).notes).toBe("turno mañana");
      });

      it("treats a wrong-typed notes field as absent", () => {
        expect(schema.parse({ notes: 5 }).notes).toBeUndefined();
      });

      it("treats a non-object body as an empty body", () => {
        expect(schema.parse([1, 2]).notes).toBeUndefined();
        expect(schema.parse("text").notes).toBeUndefined();
      });
    });
  }
});

describe("createPrintJobSchema", () => {
  it("only accepts the two printable kinds", () => {
    expect(createPrintJobSchema.safeParse({ sessionId: "s", kind: "entry" }).success).toBe(true);
    expect(createPrintJobSchema.safeParse({ sessionId: "s", kind: "reprint" }).success).toBe(true);
    expect(createPrintJobSchema.safeParse({ sessionId: "s", kind: "close" }).success).toBe(false);
    expect(createPrintJobSchema.safeParse({ sessionId: 1, kind: "entry" }).success).toBe(false);
  });
});

describe("updatePrintJobSchema", () => {
  it("accepts the three job statuses and requires an id", () => {
    for (const status of ["pending", "printed", "error"]) {
      expect(updatePrintJobSchema.safeParse({ id: "j", status }).success).toBe(true);
    }
    expect(updatePrintJobSchema.safeParse({ id: "j", status: "queued" }).success).toBe(false);
    expect(updatePrintJobSchema.safeParse({ status: "printed" }).success).toBe(false);
  });

  it("keeps a long lastError intact and ignores a wrong-typed one", () => {
    expect(updatePrintJobSchema.parse({ id: "j", status: "error", lastError: "x".repeat(400) }).lastError).toHaveLength(400);
    expect(
      updatePrintJobSchema.parse({ id: "j", status: "error", lastError: { detail: "boom" } }).lastError,
    ).toBeUndefined();
  });
});
