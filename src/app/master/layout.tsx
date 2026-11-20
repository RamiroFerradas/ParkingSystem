import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBranchContext } from "@/lib/auth/context";

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
      <header className="border-b border-neutral-800 px-6 py-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Master</p>
        <p className="text-sm font-semibold text-neutral-100">
          Administración del negocio
        </p>
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
