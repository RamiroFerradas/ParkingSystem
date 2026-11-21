import Link from "next/link";
import { getBranchContext } from "@/lib/auth/context";
import { formatARS } from "@/lib/format";
import { loadSubscriptionImpact, type SubscriptionImpact } from "@/lib/queries/dashboard";

export interface SubscriptionsCardProps {
  data: SubscriptionImpact;
}

/** Impacto de abonos en el día: activos, recurrente y próximos vencimientos. */
export function SubscriptionsCard({ data }: SubscriptionsCardProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-200">Abonados</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Vigentes hoy y facturación recurrente
          </p>
        </div>
        <Link
          href="/reportes/abonados"
          className="shrink-0 rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800"
        >
          Ver detalle
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] text-neutral-500">Activos</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">{data.active}</p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500">Recurrente / mes</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-100">
            {formatARS(data.recurringCents)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500">Vencen 30 días</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-400">{data.expiring}</p>
        </div>
      </div>
    </div>
  );
}

export async function SubscriptionsCardSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  if (!context.can("reports.read")) return null;
  const data = await loadSubscriptionImpact(context.branchId);
  return <SubscriptionsCard data={data} />;
}
