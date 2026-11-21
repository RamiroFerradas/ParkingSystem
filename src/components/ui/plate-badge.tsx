import { cx } from "@/lib/ui-classes";

export interface PlateBadgeProps {
  plate: string;
  className?: string;
}

/**
 * Mercosur plate chrome copied from the login brand plate: white plate, blue
 * stripe, uppercase ink. The ingreso form uses the same chrome for its input
 * with a thinner stripe (`h-1.5`) and mono text, so it is not this component.
 */
export function PlateBadge({ plate, className }: PlateBadgeProps) {
  return (
    <div
      className={cx(
        "w-fit overflow-hidden rounded-md bg-plate shadow-[0_1px_0_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div className="h-2 bg-plate-blue" />
      <p className="px-3 py-1.5 text-[12px] font-extrabold uppercase leading-none tracking-[0.18em] text-plate-ink">
        {plate}
      </p>
    </div>
  );
}
