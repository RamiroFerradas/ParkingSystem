import { cx } from "@/lib/ui-classes";

/**
 * The most repeated message among the 18 pages (reportes, reportes/boxes,
 * reportes/abonados, reportes/turnos, reportes/turnos/[id]); every other page
 * passes its own sentence.
 */
export const ACCESS_DENIED_MESSAGE =
  "Requiere permiso de reportes (supervisor o administrador).";

export interface AccessDeniedProps {
  message?: string;
  className?: string;
}

export function AccessDenied({ message = ACCESS_DENIED_MESSAGE, className }: AccessDeniedProps) {
  return (
    <div className={cx("mx-auto max-w-lg", className)}>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <p className="text-sm font-medium text-amber-400">Acceso restringido</p>
        <p className="mt-1 text-sm text-neutral-300">{message}</p>
      </div>
    </div>
  );
}
