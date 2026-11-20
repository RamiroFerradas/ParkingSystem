import type { ComponentProps } from "react";
import { cx } from "@/lib/ui-classes";

export interface SubmitButtonProps extends Omit<ComponentProps<"button">, "type"> {
  busy?: boolean;
  /** Label while busy; defaults to the ingreso form wording. */
  busyLabel?: string;
  type?: "button" | "submit";
}

/**
 * White "paper" submit button from the ingreso form. `className` is appended so
 * callers keep call-site tweaks (e.g. forcing full width on a phone).
 */
export function SubmitButton({
  busy = false,
  busyLabel = "Registrando...",
  type = "submit",
  className,
  disabled,
  children,
  ...rest
}: SubmitButtonProps) {
  return (
    <button
      type={type}
      disabled={busy || disabled}
      className={cx(
        "w-full rounded-md bg-neutral-100 px-6 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-60 sm:w-auto",
        className,
      )}
      {...rest}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
