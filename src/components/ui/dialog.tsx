"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Tone = "default" | "danger";

const PANEL =
  "dialog-panel relative w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]";

/**
 * Comportamiento compartido: Escape, click afuera, foco inicial, trampa de tab
 * y bloqueo del scroll del body. Sin estado de React: todo vive en el efecto.
 */
function useDialogBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);

  return panelRef;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  tone = "default",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useDialogBehavior(open, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dialog-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-tone={tone}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`${PANEL} p-6`}
      >
        <h2
          id="dialog-title"
          className="text-base font-semibold tracking-tight text-neutral-100"
        >
          {title}
        </h2>
        {description ? (
          <div className="mt-1.5 text-sm leading-relaxed text-neutral-400">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

function CancelButton({
  onClose,
  busy,
}: {
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={busy}
      className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-50"
    >
      Cancelar
    </button>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "danger",
  icon,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  tone?: Tone;
  icon?: ReactNode;
  error?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      description={icon ? undefined : description}
      tone={tone}
      footer={
        <>
          <CancelButton onClose={onClose} busy={busy} />
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white transition disabled:opacity-60 ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
    >
      {icon ? (
        <div
          className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${
            tone === "danger"
              ? "border-red-500/25 bg-red-500/[0.07] text-red-200"
              : "border-neutral-800 bg-neutral-950/60 text-neutral-300"
          }`}
        >
          <span className="mt-0.5 shrink-0">{icon}</span>
          <span className="leading-relaxed">{description}</span>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

export function PromptDialog({
  open,
  onClose,
  onSubmit,
  title,
  description,
  label,
  defaultValue = "",
  placeholder,
  type = "text",
  minLength = 0,
  hint,
  confirmLabel = "Guardar",
  busy = false,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  description?: ReactNode;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: "text" | "password";
  minLength?: number;
  hint?: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
}) {
  // El valor inicial entra por `defaultValue`; los callers remontan con `key`
  // al abrir otro registro, así no hace falta resetear por efecto.
  const [value, setValue] = useState(defaultValue);
  const canSubmit = value.length >= minLength && value.length > 0;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      description={description}
      footer={
        <>
          <CancelButton onClose={onClose} busy={busy} />
          <button
            type="submit"
            form="prompt-dialog-form"
            disabled={busy || !canSubmit}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? "Guardando…" : confirmLabel}
          </button>
        </>
      }
    >
      <form
        id="prompt-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !busy) onSubmit(value);
        }}
      >
        <label htmlFor="prompt-dialog-input" className="block text-xs text-neutral-400">
          {label}
        </label>
        <input
          id="prompt-dialog-input"
          type={type}
          value={value}
          placeholder={placeholder}
          maxLength={72}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
        />
        {hint ? <p className="mt-1.5 text-xs text-neutral-500">{hint}</p> : null}
        {error ? (
          <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
