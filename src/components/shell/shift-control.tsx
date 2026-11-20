"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LinkPendingContent } from "./link-pending";
import {
  LONG_SHIFT_MINUTES,
  formatElapsedText,
  shiftNoun,
} from "@/lib/shifts/format";
import type { OpenShiftSummary } from "@/lib/shifts/types";
import { useToast } from "./toast";

/**
 * Estado del turno en el header. El chip es la puerta al detalle y al cierre;
 * cuando el turno lleva demasiado abierto se vuelve ámbar y el cierre pasa a
 * ser la acción principal. Sin turno, abrir es la acción principal.
 */
export function ShiftControl({ shift }: { shift: OpenShiftSummary | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const elapsedMinutes =
    shift && nowMs !== null
      ? Math.max(0, Math.floor((nowMs - shift.openedAtMs) / 60_000))
      : (shift?.elapsedMinutes ?? 0);
  const overdue = elapsedMinutes >= LONG_SHIFT_MINUTES;
  const busy = pending || isRefreshing;

  async function openShift() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/shifts/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast(data?.error ?? "No se pudo abrir el turno", "error");
        startRefresh(() => router.refresh());
        return;
      }
      toast("Turno abierto");
      startRefresh(() => router.refresh());
    } catch {
      toast("Servidor no disponible", "error");
    } finally {
      setPending(false);
    }
  }

  async function closeShift() {
    if (!shift) return;
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
        startRefresh(() => router.refresh());
        return;
      }
      setOpen(false);
      setConfirming(false);
      toast(`Turno cerrado · Facturado ${shift.collectedLabel}`);
      startRefresh(() => router.refresh());
    } catch {
      setError("Servidor no disponible");
    } finally {
      setPending(false);
    }
  }

  function closePanel() {
    setOpen(false);
    setConfirming(false);
    setError(null);
  }

  return (
    <div className="relative">
      {open && shift ? (
        <button
          type="button"
          aria-label="Cerrar panel del turno"
          onClick={closePanel}
          className="fixed inset-0 z-40 cursor-default"
        />
      ) : null}

      <div className="relative z-50 flex items-center gap-2">
        {shift ? (
          <>
            <button
              type="button"
              onClick={() => {
                setOpen((value) => !value);
                setConfirming(false);
                setError(null);
              }}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (overdue
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15")
              }
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  overdue ? "bg-amber-400" : "bg-emerald-400"
                }`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Turno abierto</span>
              <span className="hidden opacity-60 sm:inline">·</span>
              <span className="tabular-nums">{formatElapsedText(elapsedMinutes)}</span>
              {shift.openSessions > 0 ? (
                <span className="hidden rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 sm:inline">
                  {shift.openSessions} {shift.openSessions === 1 ? "auto" : "autos"}
                </span>
              ) : null}
              {overdue ? (
                <span className="hidden font-semibold sm:inline">· ¿lo cerraste?</span>
              ) : null}
            </button>
            {shift.canClose ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setConfirming(true);
                  setError(null);
                }}
                className={
                  "hidden rounded-md px-2.5 py-1.5 text-xs font-semibold sm:block " +
                  (overdue
                    ? "bg-amber-500 text-neutral-950 hover:bg-amber-400"
                    : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800")
                }
              >
                Cerrar turno
              </button>
            ) : null}
          </>
        ) : (
          <>
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
              Sin turno abierto
            </span>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400 sm:hidden" />
            <button
              type="button"
              onClick={openShift}
              disabled={busy}
              className="rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Abriendo..." : "Abrir turno"}
            </button>
          </>
        )}
      </div>

      {open && shift ? (
        <div
          role="dialog"
          aria-label="Turno de caja"
          className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-100">Turno abierto</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Abrió {shift.openedByName} · {shift.openedAtLabel} hs
              </p>
            </div>
            <Link
              href="/administracion/turnos"
              onClick={closePanel}
              className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800"
            >
              <LinkPendingContent>Detalle</LinkPendingContent>
            </Link>
          </div>

          <p
            className={
              "mt-3 text-lg font-semibold tabular-nums " +
              (overdue ? "text-amber-300" : "text-neutral-100")
            }
          >
            {formatElapsedText(elapsedMinutes)}
          </p>
          {overdue ? (
            <p className="text-[11px] text-amber-300">¿Ya lo cerraste?</p>
          ) : null}

          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3 text-xs">
            <div>
              <dt className="text-neutral-500">Facturado</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-neutral-200">
                {shift.collectedLabel}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Autos adentro</dt>
              <dd
                className={
                  "mt-0.5 font-medium tabular-nums " +
                  (shift.openSessions > 0 ? "text-amber-300" : "text-neutral-200")
                }
              >
                {shift.openSessions}
              </dd>
            </div>
          </dl>

          {shift.openSessions > 0 ? (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
              {shift.openSessions} {shiftNoun(shift.openSessions)} sin egreso.{" "}
              <Link href="/operaciones/estadias" onClick={closePanel} className="underline">
                Ver estadías
              </Link>
            </p>
          ) : null}

          {!shift.canClose ? (
            <p className="mt-3 text-[11px] text-neutral-400">
              Solo {shift.openedByName} puede cerrar este turno.
            </p>
          ) : confirming ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-200">¿Cerrar el turno?</p>
              <p className="mt-1 text-[11px] text-neutral-400">
                Facturado {shift.collectedLabel} · {shift.openSessions}{" "}
                {shiftNoun(shift.openSessions)} adentro
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={closeShift}
                  disabled={busy || shift.openSessions > 0}
                  className="flex-1 rounded-md bg-amber-500 px-2 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Cerrando..." : "Confirmar cierre"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                  }}
                  disabled={busy}
                  className="rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="mt-3 w-full rounded-md bg-neutral-100 px-2 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-white disabled:opacity-60"
            >
              Cerrar turno
            </button>
          )}

          {error ? (
            <p
              role="alert"
              className="mt-2 rounded-md bg-red-500/10 px-2.5 py-2 text-[11px] text-red-400"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
