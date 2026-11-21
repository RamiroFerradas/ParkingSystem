import { describe, expect, it } from "vitest";
import {
  createBoxSchema,
  createBranchSchema,
  createCatalogSchema,
  createFloorSchema,
  createVehicleTypeSchema,
  toggleBoxServiceSchema,
  updateBoxSchema,
  updateBranchSchema,
  updateFloorSchema,
  updatePaymentMethodSchema,
  updateVehicleTypeSchema,
} from "@/lib/schemas/catalogs";

describe("createCatalogSchema (payment methods)", () => {
  it("trims and upper-cases the code and trims the name", () => {
    expect(createCatalogSchema.parse({ code: " cash ", name: " Efectivo " })).toEqual({
      code: "CASH",
      name: "Efectivo",
    });
  });

  it("rejects a blank code or name and the length limits", () => {
    expect(createCatalogSchema.safeParse({ code: "  ", name: "Efectivo" }).success).toBe(false);
    expect(createCatalogSchema.safeParse({ code: "CASH", name: " " }).success).toBe(false);
    expect(createCatalogSchema.safeParse({ code: "A".repeat(21), name: "Efectivo" }).success).toBe(
      false,
    );
    expect(createCatalogSchema.safeParse({ code: "CASH", name: "A".repeat(41) }).success).toBe(
      false,
    );
    expect(createCatalogSchema.safeParse({ code: 7, name: "Efectivo" }).success).toBe(false);
  });
});

describe("updatePaymentMethodSchema", () => {
  it("keeps the fields as sent and leaves absent ones out", () => {
    expect(updatePaymentMethodSchema.parse({ id: "pm-1" })).toEqual({ id: "pm-1" });
    expect(
      updatePaymentMethodSchema.parse({ id: "pm-1", name: " Efectivo ", isActive: false }),
    ).toEqual({ id: "pm-1", name: " Efectivo ", isActive: false });
  });

  it("treats a wrong JSON type as absent instead of an error", () => {
    expect(
      updatePaymentMethodSchema.parse({ id: "pm-1", name: 3, isActive: "false" }),
    ).toEqual({ id: "pm-1" });
  });

  it("requires a string id", () => {
    expect(updatePaymentMethodSchema.safeParse({ name: "Efectivo" }).success).toBe(false);
    expect(updatePaymentMethodSchema.safeParse({ id: 1 }).success).toBe(false);
  });
});

describe("createVehicleTypeSchema", () => {
  it("derives an upper-cased code from an accented name", () => {
    expect(createVehicleTypeSchema.parse({ name: "Camión Eléctrico", sortOrder: 3.9 })).toEqual({
      code: "CAMION_ELECTRICO",
      name: "Camión Eléctrico",
      sortOrder: 3,
    });
  });

  it("upper-cases an explicit code instead of deriving one", () => {
    expect(createVehicleTypeSchema.parse({ name: "Moto", code: " moto " }).code).toBe("MOTO");
  });

  it("defaults the sort order to zero", () => {
    expect(createVehicleTypeSchema.parse({ name: "Moto", sortOrder: "1" }).sortOrder).toBe(0);
  });

  it("requires a name of up to 40 characters", () => {
    expect(createVehicleTypeSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createVehicleTypeSchema.safeParse({ name: "A".repeat(41) }).success).toBe(false);
  });

  it("keeps an explicit code that is too long for the route to reject", () => {
    expect(createVehicleTypeSchema.parse({ name: "Moto", code: "m".repeat(21) }).code).toBe(
      "M".repeat(21),
    );
  });
});

describe("updateVehicleTypeSchema", () => {
  it("keeps the raw values so the audit row records what was sent", () => {
    expect(
      updateVehicleTypeSchema.parse({ id: "vt-1", name: " Auto ", sortOrder: 2.7 }),
    ).toEqual({ id: "vt-1", name: " Auto ", sortOrder: 2.7 });
  });

  it("treats a wrong JSON type as absent", () => {
    expect(updateVehicleTypeSchema.parse({ id: "vt-1", sortOrder: "2", isActive: 0 })).toEqual({
      id: "vt-1",
    });
  });
});

describe("createBranchSchema", () => {
  it("trims the name and defaults a missing code to an empty string", () => {
    expect(createBranchSchema.parse({ name: "  Nueva  " })).toEqual({ name: "Nueva", code: "" });
    expect(createBranchSchema.parse({ name: "Nueva", code: " NV " }).code).toBe("NV");
  });

  it("requires a non-empty name", () => {
    expect(createBranchSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createBranchSchema.safeParse({ name: 3 }).success).toBe(false);
  });
});

describe("updateBranchSchema", () => {
  it("trims a provided name and turns a blank code into null", () => {
    expect(updateBranchSchema.parse({ name: "  Centro  ", code: "  " })).toEqual({
      name: "Centro",
      code: null,
    });
  });

  it("treats null and wrong types as absent", () => {
    expect(updateBranchSchema.parse({ name: null, code: 1, isActive: "yes" })).toEqual({});
  });

  it("rejects a blank name", () => {
    expect(updateBranchSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("createFloorSchema", () => {
  it("normalizes name, box count, prefix and order", () => {
    expect(
      createFloorSchema.parse({
        name: " Planta Baja ",
        boxCount: 3.7,
        prefix: "a1",
        sortOrder: 2.8,
      }),
    ).toEqual({ name: "Planta Baja", boxCount: 3, prefix: "A1", sortOrder: 2 });
  });

  it("defaults the optional fields", () => {
    expect(createFloorSchema.parse({ name: "Planta" })).toEqual({
      name: "Planta",
      boxCount: 0,
      prefix: "",
      sortOrder: 0,
    });
  });

  it("requires a name of up to 50 characters", () => {
    expect(createFloorSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createFloorSchema.safeParse({ name: "x".repeat(51) }).success).toBe(false);
  });

  it("leaves the box count range to the route but still normalizes it", () => {
    expect(createFloorSchema.parse({ name: "P", boxCount: -1 }).boxCount).toBe(-1);
    expect(createFloorSchema.parse({ name: "P", boxCount: 121 }).boxCount).toBe(121);
  });
});

describe("updateFloorSchema", () => {
  it("keeps a raw name and order so the handler can validate and audit them", () => {
    expect(updateFloorSchema.parse({ id: "floor-1", name: "  ", sortOrder: 4.9 })).toEqual({
      id: "floor-1",
      name: "  ",
      sortOrder: 4.9,
    });
  });

  it("treats a wrong JSON type as absent", () => {
    expect(updateFloorSchema.parse({ id: "floor-1", name: 1, isActive: "true" })).toEqual({
      id: "floor-1",
    });
  });

  it("requires a string id", () => {
    expect(updateFloorSchema.safeParse({ name: "Otro" }).success).toBe(false);
  });
});

describe("createBoxSchema", () => {
  it("upper-cases and trims the number", () => {
    expect(createBoxSchema.parse({ floorId: "floor-1", number: "  b2 " })).toEqual({
      floorId: "floor-1",
      number: "B2",
      sector: null,
    });
  });

  it("keeps a trimmed sector and stores a blank one as null", () => {
    expect(
      createBoxSchema.parse({ floorId: "floor-1", number: "B2", sector: "  Norte " }).sector,
    ).toBe("Norte");
    expect(createBoxSchema.parse({ floorId: "floor-1", number: "B2", sector: "   " }).sector).toBe(
      null,
    );
    expect(createBoxSchema.parse({ floorId: "floor-1", number: "B2", sector: 5 }).sector).toBe(null);
  });

  it("requires a floor and a number of up to 12 characters", () => {
    expect(createBoxSchema.safeParse({ number: "B2" }).success).toBe(false);
    expect(createBoxSchema.safeParse({ floorId: "floor-1", number: "   " }).success).toBe(false);
    expect(
      createBoxSchema.safeParse({ floorId: "floor-1", number: "1234567890123" }).success,
    ).toBe(false);
  });
});

describe("updateBoxSchema", () => {
  it("keeps the values as sent and leaves absent ones out", () => {
    expect(updateBoxSchema.parse({ id: "box-1", number: " b2 ", isActive: false })).toEqual({
      id: "box-1",
      number: " b2 ",
      isActive: false,
    });
  });

  it("treats a wrong JSON type as absent", () => {
    expect(updateBoxSchema.parse({ id: "box-1", floorId: 9, sector: null })).toEqual({
      id: "box-1",
    });
  });

  it("requires a string id", () => {
    expect(updateBoxSchema.safeParse({ sector: "Norte" }).success).toBe(false);
  });
});

describe("toggleBoxServiceSchema", () => {
  it("requires a string box id and a boolean flag", () => {
    expect(toggleBoxServiceSchema.parse({ boxId: "box-1", serviceEnabled: true })).toEqual({
      boxId: "box-1",
      serviceEnabled: true,
    });
    expect(toggleBoxServiceSchema.safeParse({ boxId: "box-1" }).success).toBe(false);
    expect(
      toggleBoxServiceSchema.safeParse({ boxId: "box-1", serviceEnabled: "true" }).success,
    ).toBe(false);
  });
});
