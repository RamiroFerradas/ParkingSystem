"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface BranchOption {
  branchId: string;
  branchName: string;
  role: string;
}

/**
 * Cambia la sucursal activa re-emitiendo la cookie de sesión en el servidor.
 * No guarda la sucursal en el cliente: el cliente solo dispara el cambio.
 */
export function BranchSwitcher({
  current,
  options,
}: {
  current: string | null;
  options: BranchOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);

  if (options.length <= 1) {
    return (
      <p className="truncate text-xs text-neutral-400">
        {options[0]?.branchName ?? "Sin sucursal"}
      </p>
    );
  }

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const branchId = event.target.value;
    const previous = value;
    setValue(branchId);
    setError(null);
    try {
      const response = await fetch("/api/auth/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (!response.ok) {
        setValue(previous);
        setError("No se pudo cambiar de sucursal");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setValue(previous);
      setError("No se pudo cambiar de sucursal");
    }
  }

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-neutral-600">
        Sucursal
      </label>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.branchId} value={option.branchId}>
            {option.branchName}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-[10px] text-red-400">{error}</p> : null}
    </div>
  );
}
