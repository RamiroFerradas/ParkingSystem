import { getBranchContext } from "@/lib/auth/context";
import { formatARS } from "@/lib/format";
import { loadYesterdayComparison, type YesterdayComparison } from "@/lib/queries/dashboard";
import { MetricCard } from "./metric-card";

export interface YesterdayCardsProps {
  data: YesterdayComparison;
}

export function YesterdayCards({ data }: YesterdayCardsProps) {
  const { diffPct } = data;
  return (
    <>
      <MetricCard
        label="Ingresos de ayer"
        value={String(data.entriesYesterday)}
        tone="neutral"
      />
      <MetricCard
        label="Recaudado ayer"
        value={formatARS(data.collectedYesterdayCents)}
        tone="neutral"
      />
      <MetricCard
        label="Hoy vs ayer"
        value={`${diffPct >= 0 ? "+" : ""}${diffPct}%`}
        tone={diffPct >= 0 ? "green" : "red"}
        className="col-span-2 sm:col-span-1"
      />
    </>
  );
}

export async function YesterdayCardsSection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const data = await loadYesterdayComparison(context.branchId);
  return <YesterdayCards data={data} />;
}
