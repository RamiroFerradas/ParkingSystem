import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBranchContext } from "@/lib/auth/context";
import { Sidebar } from "@/components/shell/sidebar";

/**
 * Con Cache Components activo, la lectura de sesión (cookies) va dentro de
 * un boundary de Suspense: el shell estático se prerenderiza y la sesión
 * llega por streaming.
 */
export default function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ShellGate>{children}</ShellGate>
    </Suspense>
  );
}

async function ShellGate({ children }: { children: React.ReactNode }) {
  const context = await getBranchContext();
  if (!context) {
    // `expired` evita el loop con el proxy cuando la cookie existe pero ya
    // no es válida (usuario borrado/desactivado o cookie de otro ambiente).
    redirect("/login?expired=1");
  }
  if (!context.branchId) {
    redirect("/seleccionar-sucursal");
  }
  return (
    <div className="flex h-screen">
      <Sidebar context={context} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-screen">
      <div className="h-screen w-60 shrink-0 border-r border-neutral-800 bg-neutral-900" />
      <main className="flex-1 p-6">
        <div className="h-32 animate-pulse rounded-xl bg-neutral-900" />
      </main>
    </div>
  );
}
