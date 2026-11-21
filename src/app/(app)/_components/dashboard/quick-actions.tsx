import Link from "next/link";
import { getBranchContext } from "@/lib/auth/context";
import { ReportLinkSection } from "./report-link";

export interface QuickActionsProps {
  canOpen: boolean;
  canClose: boolean;
}

/** Atajos del día: las dos acciones que más se usan en el mostrador. */
export function QuickActions({ canOpen, canClose }: QuickActionsProps) {
  if (!canOpen && !canClose) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canOpen && (
        <Link
          href="/operaciones/ingreso"
          className="inline-flex min-h-10 items-center rounded-md bg-amber-200 px-3 text-xs font-semibold text-neutral-950 hover:bg-amber-100"
        >
          Registrar ingreso
        </Link>
      )}
      {canClose && (
        <Link
          href="/operaciones/egreso"
          className="inline-flex min-h-10 items-center rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
        >
          Cobrar egreso
        </Link>
      )}
      <ReportLinkSection />
    </div>
  );
}

export async function QuickActionsSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  return <QuickActions canOpen={context.can("session.open")} canClose={context.can("session.close")} />;
}
