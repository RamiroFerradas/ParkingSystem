import Link from "next/link";
import { getBranchContext } from "@/lib/auth/context";

export interface ReportLinkProps {
  visible: boolean;
}

export function ReportLink({ visible }: ReportLinkProps) {
  if (!visible) return null;
  return (
    <Link
      href="/reportes"
      className="inline-flex min-h-10 items-center gap-1 rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
    >
      Ver reportes
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/** Resuelve `reports.read` para el atajo de reportes del encabezado. */
export async function ReportLinkSection() {
  const context = await getBranchContext();
  return <ReportLink visible={context?.can("reports.read") ?? false} />;
}
