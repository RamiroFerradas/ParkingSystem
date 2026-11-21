import { describe, expect, it } from "vitest";
import {
  cancelSpecialTariffSchema,
  cancelSubscriptionSchema,
  createSpecialTariffSchema,
  createSubscriptionSchema,
  createTariffSchema,
  updateTariffSchema,
  type CreateTariffPayload,
} from "@/lib/schemas/money";

describe("createTariffSchema", () => {
  const body = {
    vehicleTypeId: "vt-1",
    durationMinutes: 120,
    amountCents: 500_000,
  };

  it("trims the legacy code/name/description fields", () => {
    const payload: CreateTariffPayload = createTariffSchema.parse({
      ...body,
      code: "  AUTO120 ",
      name: "  Auto 2 h  ",
      description: "  cubierto  ",
    });

    expect(payload.code).toBe("AUTO120");
    expect(payload.name).toBe("Auto 2 h");
    expect(payload.description).toBe("cubierto");
  });

  it("turns a blank or non-string code and description into null", () => {
    const blank = createTariffSchema.parse({ ...body, code: "   ", description: 7 });

    expect(blank.code).toBeNull();
    expect(blank.description).toBeNull();
    expect(createTariffSchema.parse(body).code).toBeNull();
  });

  it("falls back to an hourly block unless kind is exactly monthly", () => {
    expect(createTariffSchema.parse(body).kind).toBe("hourly");
    expect(createTariffSchema.parse({ ...body, kind: "monthly" }).kind).toBe("monthly");
    expect(createTariffSchema.parse({ ...body, kind: "MONTHLY" }).kind).toBe("hourly");
    expect(createTariffSchema.parse({ ...body, kind: 1 }).kind).toBe("hourly");
  });

  it("coerces the amounts with Number() and keeps NaN as the rejected marker", () => {
    const payload = createTariffSchema.parse({
      ...body,
      durationMinutes: "90",
      amountCents: "1000",
    });

    expect(payload.durationMinutes).toBe(90);
    expect(payload.amountCents).toBe(1000);
    expect(createTariffSchema.parse({ ...body, amountCents: "nope" }).amountCents).toBeNaN();
    expect(createTariffSchema.parse({ vehicleTypeId: "vt-1" }).amountCents).toBeNaN();
  });

  it("degrades a non-string vehicle type to an empty string", () => {
    expect(createTariffSchema.parse({ ...body, vehicleTypeId: 5 }).vehicleTypeId).toBe("");
  });

  it("passes the dates through untouched so the route keeps ABSENT/INVALID", () => {
    const empty = createTariffSchema.parse(body);
    const invalid = createTariffSchema.parse({ ...body, validFrom: "nope", validTo: null });

    expect(empty.validFrom).toBeUndefined();
    expect(empty.validTo).toBeUndefined();
    expect(invalid.validFrom).toBe("nope");
    expect(invalid.validTo).toBeNull();
  });

  it("rejects a body that is not an object", () => {
    expect(createTariffSchema.safeParse(null).success).toBe(false);
    expect(createTariffSchema.safeParse("nope").success).toBe(false);
  });
});

describe("updateTariffSchema", () => {
  it("requires the tariff id", () => {
    expect(updateTariffSchema.safeParse({ id: 5 }).success).toBe(false);
    expect(updateTariffSchema.safeParse({}).success).toBe(false);
  });

  it("leaves untouched fields undefined", () => {
    const payload = updateTariffSchema.parse({ id: "t-1" });

    expect(payload.amountCents).toBeUndefined();
    expect(payload.isActive).toBeUndefined();
    expect(payload.validFrom).toBeUndefined();
  });

  it("keeps the Number() coercion and ignores a non-boolean isActive", () => {
    const payload = updateTariffSchema.parse({
      id: "t-1",
      amountCents: "750000",
      isActive: "yes",
    });

    expect(payload.amountCents).toBe(750_000);
    expect(payload.isActive).toBeUndefined();
    expect(updateTariffSchema.parse({ id: "t-1", isActive: false }).isActive).toBe(false);
  });
});

describe("createSpecialTariffSchema", () => {
  const body = {
    name: "Fiestas",
    startsAt: "2026-12-20T00:00:00Z",
    endsAt: "2026-12-31T00:00:00Z",
    adjustmentType: "percent",
    adjustmentValue: 20,
  };

  it("trims the name and defaults every other string to empty", () => {
    const payload = createSpecialTariffSchema.parse({ name: "  Fiestas  " });

    expect(payload.name).toBe("Fiestas");
    expect(payload.startsAt).toBe("");
    expect(payload.adjustmentType).toBe("");
  });

  it("floors a numeric priority and defaults anything else to 100", () => {
    expect(createSpecialTariffSchema.parse({ ...body, priority: 5.8 }).priority).toBe(5);
    expect(createSpecialTariffSchema.parse(body).priority).toBe(100);
    expect(createSpecialTariffSchema.parse({ ...body, priority: "5" }).priority).toBe(100);
  });

  it("keeps only string vehicle type ids", () => {
    expect(
      createSpecialTariffSchema.parse({ ...body, vehicleTypeIds: ["vt-1", 42, null] })
        .vehicleTypeIds,
    ).toEqual(["vt-1"]);
    expect(createSpecialTariffSchema.parse({ ...body, vehicleTypeIds: "vt-1" }).vehicleTypeIds).toEqual(
      [],
    );
  });

  it("coerces the adjustment value with Number()", () => {
    expect(createSpecialTariffSchema.parse({ ...body, adjustmentValue: "10" }).adjustmentValue).toBe(
      10,
    );
    expect(createSpecialTariffSchema.parse({ ...body, adjustmentValue: "x" }).adjustmentValue).toBeNaN();
  });
});

describe("cancelSpecialTariffSchema", () => {
  it("only accepts the cancelled transition", () => {
    expect(cancelSpecialTariffSchema.safeParse({ id: "sp-1", status: "cancelled" }).success).toBe(
      true,
    );
    expect(cancelSpecialTariffSchema.safeParse({ id: "sp-1", status: "active" }).success).toBe(
      false,
    );
    expect(cancelSpecialTariffSchema.safeParse({ id: 1, status: "cancelled" }).success).toBe(false);
  });
});

describe("createSubscriptionSchema", () => {
  const body = {
    plate: "ab-123cd",
    tariffId: "t-1",
    startsOn: "2026-01-01",
    endsOn: "2026-01-31",
    methodId: "pm-1",
  };

  it("normalizes the plate", () => {
    expect(createSubscriptionSchema.parse(body).plate).toBe("AB123CD");
    expect(createSubscriptionSchema.parse({ ...body, plate: " !-- " }).plate).toBe("");
    expect(createSubscriptionSchema.parse({ ...body, plate: 42 }).plate).toBe("");
  });

  it("defaults the missing strings to empty", () => {
    const payload = createSubscriptionSchema.parse({});

    expect(payload.tariffId).toBe("");
    expect(payload.startsOn).toBe("");
    expect(payload.endsOn).toBe("");
    expect(payload.methodId).toBe("");
  });

  it("trims notes and collapses them to null when blank", () => {
    expect(createSubscriptionSchema.parse({ ...body, notes: "  pagó  " }).notes).toBe("pagó");
    expect(createSubscriptionSchema.parse({ ...body, notes: "   " }).notes).toBeNull();
    expect(createSubscriptionSchema.parse({ ...body, notes: 3 }).notes).toBeNull();
  });
});

describe("cancelSubscriptionSchema", () => {
  it("requires an id with content", () => {
    expect(cancelSubscriptionSchema.safeParse({ id: "sub-1" }).success).toBe(true);
    expect(cancelSubscriptionSchema.safeParse({ id: "" }).success).toBe(false);
    expect(cancelSubscriptionSchema.safeParse({}).success).toBe(false);
    expect(cancelSubscriptionSchema.safeParse({ id: 5 }).success).toBe(false);
  });
});
