import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { getBranchContext } from "@/lib/auth/context";
import { BranchPill } from "@/components/shell/branch-pill";

export default function MasterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<MasterSkeleton />}>
      <MasterGate>{children}</MasterGate>
    </Suspense>
  );
}

async function MasterGate({ children }: { children: React.ReactNode }) {
  const context = await getBranchContext();
  if (!context) redirect("/login?expired=1");
  if (!context.isMaster) redirect("/");

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Master</p>
          <p className="text-sm font-semibold text-neutral-100">
            Administración del negocio
          </p>
        </div>
        <div className="flex items-center gap-4">
          <BranchPill
            current={context.branchId}
            options={context.memberships}
            canManage
          />
          <Link
            href="/"
            className="text-xs text-neutral-400 hover:text-neutral-200 hover:underline"
          >
            Ir al sistema →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  );
}

function MasterSkeleton() {
  return (
    <div className="min-h-screen bg-neutral-950 p-6">
      <div className="h-24 animate-pulse rounded-xl bg-neutral-900" />
    </div>
  );
}
