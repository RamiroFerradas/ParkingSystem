import { getBranchContext } from "@/lib/auth/context";
import { formatARS } from "@/lib/format";
import { loadTodayOperations, type TodayOperations } from "@/lib/queries/dashboard";
import { MetricCard } from "./metric-card";

export interface TodayCardsProps {
  data: TodayOperations;
}

export function TodayCards({ data }: TodayCardsProps) {
  return (
    <>
      <MetricCard label="Ingresos de hoy" value={String(data.entries)} tone="neutral" />
      <MetricCard label="Egresos de hoy" value={String(data.exits)} tone="neutral" />
      <MetricCard
        label="Recaudado hoy"
        value={formatARS(data.collectedCents)}
        tone="green"
        className="col-span-2 sm:col-span-1"
      />
    </>
  );
}

export async function TodayCardsSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const data = await loadTodayOperations(context.branchId);
  return <TodayCards data={data} />;
}
