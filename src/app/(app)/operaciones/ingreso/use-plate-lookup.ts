"use client";

import { useState } from "react";
import { normalizePlate } from "@/lib/plate";

export type PlateLookup =
  | { state: "idle" }
  | {
      state: "found";
      vehicleTypeName: string;
      vehicleTypeId: string;
      subscription?: { endsOn: string } | null;
    }
  | { state: "new" };

/**
 * Plate state plus the `/api/vehicles/lookup` call fired on blur. A hit locks the
 * vehicle type (the form hides the select), a miss asks the operator to pick one.
 */
export function usePlateLookup() {
  const [plate, setPlate] = useState("");
  const [lookup, setLookup] = useState<PlateLookup>({ state: "idle" });
  const [vehicleTypeId, setVehicleTypeId] = useState("");

  async function lookupPlate(raw: string) {
    const plate = normalizePlate(raw);
    if (!plate) return;
    try {
      const res = await fetch(`/api/vehicles/lookup?plate=${encodeURIComponent(plate)}`);
      const data = (await res.json()) as {
        found: boolean;
        vehicleTypeId?: string;
        vehicleTypeName?: string;
        subscription?: { active: boolean; endsOn: string } | null;
      };
      if (data.found && data.vehicleTypeId && data.vehicleTypeName) {
        setLookup({
          state: "found",
          vehicleTypeName: data.vehicleTypeName,
          vehicleTypeId: data.vehicleTypeId,
          subscription: data.subscription ?? null,
        });
        setVehicleTypeId(data.vehicleTypeId);
      } else {
        setLookup({ state: "new" });
        setVehicleTypeId("");
      }
    } catch {
      setLookup({ state: "idle" });
    }
  }

  /** Clears the plate, the lookup result and the locked type in one step. */
  function resetPlate() {
    setPlate("");
    setLookup({ state: "idle" });
    setVehicleTypeId("");
  }

  return { plate, setPlate, lookup, vehicleTypeId, setVehicleTypeId, lookupPlate, resetPlate };
}
