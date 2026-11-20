import type { ComponentProps, ReactNode } from "react";
import { cx, inputCls } from "@/lib/ui-classes";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Id of the control rendered as children, used by the label's `htmlFor`. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + messages stack from the login and ingreso forms. The
 * control keeps its own `mt-1` spacing, exactly as those forms write it today.
 */
export function Field({ label, hint, error, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cx("block", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-neutral-400">
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export type TextInputProps = ComponentProps<"input">;

export function TextInput({ className, ...props }: TextInputProps) {
  return <input className={cx(inputCls, className)} {...props} />;
}
