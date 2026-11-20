"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BranchOption } from "./branch-pill";

export function BranchPicker({ options }: { options: BranchOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(branchId: string) {
    setBusy(branchId);
    setError(null);
    try {
      const response = await fetch("/api/auth/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (!response.ok) {
        setError("No podés entrar a esa sucursal.");
        setBusy(null);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo seleccionar la sucursal.");
      setBusy(null);
    }
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No tenés sucursales asignadas. Pedile al administrador que te agregue a una.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <button
          key={option.branchId}
          type="button"
          onClick={() => choose(option.branchId)}
          disabled={busy !== null}
          className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-left transition hover:border-neutral-600 disabled:opacity-60"
        >
          <span>
            <span className="block text-sm font-medium text-neutral-100">
              {option.branchName}
            </span>
            <span className="block text-xs capitalize text-neutral-500">
              {option.role}
            </span>
          </span>
          <span className="text-xs text-neutral-500">
            {busy === option.branchId ? "Entrando…" : "Entrar →"}
          </span>
        </button>
      ))}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
