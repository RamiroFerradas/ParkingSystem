import { getBranchContext } from "@/lib/auth/context";
import { formatARS } from "@/lib/format";
import { loadPaymentMethodsToday, type PaymentMethodTotal } from "@/lib/queries/dashboard";

export interface MethodsTodayProps {
  methods: PaymentMethodTotal[];
}

export function MethodsToday({ methods }: MethodsTodayProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs font-medium text-neutral-500">Cobros de hoy por medio</p>
      {methods.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Sin cobros hoy todavía.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {methods.map((m) => (
            <li key={m.methodName} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-neutral-300">{m.methodName}</span>
              <span className="shrink-0 tabular-nums text-neutral-400">
                {m.count} × {formatARS(m.collectedCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function MethodsTodaySection() {
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  const methods = await loadPaymentMethodsToday(context.branchId);
  return <MethodsToday methods={methods} />;
}
