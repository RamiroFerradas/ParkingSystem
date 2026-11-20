"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatElapsedText, shiftNoun } from "@/lib/shifts/format";
import type { OpenShiftSummary } from "@/lib/shifts/types";

interface Props {
  name: string;
  roleLabel: string;
  branchName: string | null;
  shift: OpenShiftSummary | null;
}

/** Iniciales para el avatar del header en el teléfono (dos letras, sin apellido largo). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const [first = "", second = ""] = parts;
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

/**
 * Menú de usuario del header. "Salir" intercepta el logout cuando hay un turno
 * abierto: es el momento real en que la gente se olvida de cerrarlo.
 */
export function UserMenu({ name, roleLabel, branchName, shift }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [guard, setGuard] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guard) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setGuard(false);
      setError(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guard]);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (cause) {
      // La sesión local se abandona igual: el pedido al servidor es best-effort
      // y un fallo no debe dejar al usuario atrapado en una pantalla que ya no usa.
      console.error("No se pudo cerrar la sesión en el servidor", cause);
    } finally {
      router.replace("/login");
      setPending(false);
    }
  }

  async function closeAndLogout() {
    if (!shift) {
      await logout();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "No se pudo cerrar el turno");
        return;
      }
      await logout();
    } catch {
      setError("Servidor no disponible");
    } finally {
      setPending(false);
    }
  }

  function requestExit() {
    setOpen(false);
    if (shift) {
      setError(null);
      setGuard(true);
      return;
    }
    void logout();
  }

  return (
    <div className="relative">
      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú de usuario"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default"
        />
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={roleLabel}
        className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-xs font-medium text-neutral-200 hover:border-neutral-500 lg:h-auto lg:w-auto lg:justify-start lg:gap-2 lg:py-1 lg:pl-3 lg:pr-2"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide lg:hidden">
          {initials(name)}
        </span>
        <span className="hidden max-w-32 truncate lg:inline">{roleLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`hidden shrink-0 text-neutral-500 transition lg:block ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-[min(14rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-neutral-100">{name}</p>
            <p className="mt-0.5 truncate text-[11px] text-neutral-500">
              {roleLabel}
              {branchName ? ` · ${branchName}` : ""}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={requestExit}
            className="block w-full border-t border-neutral-800 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Salir
          </button>
        </div>
      ) : null}

      {guard && shift ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cerrar turno antes de salir"
            className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
          >
            <p className="text-base font-semibold text-neutral-100">Tenés el turno abierto</p>
            <p className="mt-1 text-sm text-neutral-400">
              {formatElapsedText(shift.elapsedMinutes)}
              {shift.openSessions > 0
                ? ` · ${shift.openSessions} ${shiftNoun(shift.openSessions)} sin egreso`
                : ""}
              . ¿Querés cerrarlo antes de salir?
            </p>

            {!shift.canClose ? (
              <p className="mt-2 text-xs text-neutral-500">
                Solo {shift.openedByName} puede cerrar este turno.
              </p>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              {shift.canClose ? (
                <button
                  type="button"
                  onClick={closeAndLogout}
                  disabled={pending || shift.openSessions > 0}
                  className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Cerrando..." : "Cerrar turno y salir"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void logout()}
                disabled={pending}
                className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                Salir sin cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuard(false);
                  setError(null);
                }}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>

            {shift.canClose && shift.openSessions > 0 ? (
              <p className="mt-2 text-[11px] text-neutral-500">
                Para cerrar el turno primero registrá el egreso de los vehículos.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
