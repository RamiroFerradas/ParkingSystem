"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LinkPendingContent } from "./link-pending";

export interface BranchOption {
  branchId: string;
  branchName: string;
  role: string;
}

/**
 * Pastilla con la sucursal activa, siempre visible en la barra superior.
 * Al hacer clic abre: cambio de sucursal (si hay más de una) y el acceso a la
 * administración. El cambio re-emite la cookie en el servidor; el cliente solo
 * dispara la acción.
 */
export function BranchPill({
  current,
  options,
  canManage,
}: {
  current: string | null;
  options: BranchOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = current
    ? options.find((option) => option.branchId === current)
    : undefined;
  const canSwitch = options.length > 1;

  async function choose(branchId: string) {
    if (branchId === current) {
      setOpen(false);
      return;
    }
    setBusy(branchId);
    setError(null);
    try {
      const response = await fetch("/api/auth/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (!response.ok) {
        setError("No podés entrar a esa sucursal");
        setBusy(null);
        return;
      }
      setOpen(false);
      setBusy(null);
      router.refresh();
    } catch {
      setError("No se pudo cambiar de sucursal");
      setBusy(null);
    }
  }

  return (
    <div className="relative min-w-0">
      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú de sucursal"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default"
        />
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative z-50 flex w-full items-center justify-between gap-2 rounded-full border border-neutral-700 bg-neutral-800 py-1 pl-2.5 pr-3 text-sm font-medium text-neutral-100 hover:border-neutral-500"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            active ? "bg-emerald-400" : "bg-neutral-500"
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {active?.branchName ?? "Elegí una sucursal"}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`shrink-0 text-neutral-500 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        >
          {canSwitch ? (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                Cambiar sucursal
              </p>
              <ul className="max-h-64 overflow-y-auto pb-1">
                {options.map((option) => {
                  const isActive = option.branchId === current;
                  return (
                    <li key={option.branchId}>
                      <button
                        type="button"
                        onClick={() => choose(option.branchId)}
                        disabled={busy !== null}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{option.branchName}</span>
                          <span className="block text-[10px] capitalize text-neutral-500">
                            {option.role}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-emerald-400">
                          {busy === option.branchId
                            ? "…"
                            : isActive
                              ? "✓"
                              : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="px-3 py-2 text-xs text-neutral-500">
              Tenés una sola sucursal asignada.
            </p>
          )}

          {canManage ? (
            <Link
              href="/sucursales"
              onClick={() => setOpen(false)}
              className="block border-t border-neutral-800 px-3 py-2 text-sm text-emerald-400 hover:bg-neutral-800"
            >
              <LinkPendingContent>Administrar sucursales →</LinkPendingContent>
            </Link>
          ) : null}

          {error ? (
            <p className="border-t border-neutral-800 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
