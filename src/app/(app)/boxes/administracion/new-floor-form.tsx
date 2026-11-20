"use client";

import { useState } from "react";
import { btnClsCompact, inputClsCompact } from "@/lib/ui-classes";

/** Alta de piso con generación masiva de boxes: nombre + cantidad + prefijo. */
export function NewFloorForm({
  disabled,
  onSubmit,
  nextSort,
}: {
  disabled: boolean;
  onSubmit: (url: string, method: "POST" | "PATCH", body: unknown) => Promise<boolean>;
  nextSort: number;
}) {
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  const prefix = suggestPrefix(name);

  return (
    <form
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const boxCount = parseInt(count, 10);
        const created = await onSubmit("/api/floors", "POST", {
          name,
          boxCount: Number.isNaN(boxCount) ? 0 : boxCount,
          prefix,
          sortOrder: nextSort,
        });
        // Solo se limpia si el alta salió bien: si falló, el operador no pierde lo que escribió.
        if (!created) return;
        setName("");
        setCount("");
      }}
    >
      <p className="text-sm font-medium text-neutral-200">Agregar piso</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={inputClsCompact + " w-full sm:w-48"}
          placeholder="Nombre del piso (ej. Planta baja)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          required
        />
        <input
          className={inputClsCompact + " w-full sm:w-40"}
          type="number"
          min={0}
          max={120}
          placeholder="Cantidad de boxes"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          required
        />
        <span className="text-xs text-neutral-500">
          Se crean <span className="font-mono text-neutral-300">{prefix || "PREFIX"}-01</span>,{" "}
          <span className="font-mono text-neutral-300">{prefix || "PREFIX"}-02</span>…
        </span>
        <button type="submit" className={btnClsCompact} disabled={disabled || !name.trim()}>
          Crear piso
        </button>
      </div>
    </form>
  );
}

function suggestPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.map((w) => w[0]!.toUpperCase()).join("");
  return /^[A-Z0-9]+$/.test(letters) && letters.length <= 8 ? letters : "";
}
