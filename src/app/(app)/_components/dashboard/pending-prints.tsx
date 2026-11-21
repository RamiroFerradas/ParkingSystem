import { getBranchContext } from "@/lib/auth/context";
import { loadPendingPrintJobs, type PendingPrintJobs } from "@/lib/queries/dashboard";

export interface PendingPrintsProps {
  data: PendingPrintJobs;
}

export function PendingPrints({ data }: PendingPrintsProps) {
  const { total } = data;
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs font-medium text-neutral-500">Impresión pendiente</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${total > 0 ? "text-amber-400" : "text-neutral-100"}`}>
        {total}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {total > 0 ? "Reintentá desde Registrar ingreso." : "Todo impreso."}
      </p>
    </div>
  );
}

export async function PendingPrintsSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const data = await loadPendingPrintJobs(context.branchId);
  return <PendingPrints data={data} />;
}
