import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBranchContext } from "@/lib/auth/context";
import { loadOpenShiftSummary } from "@/lib/queries/shift-summary";
import { AppHeader } from "@/components/shell/app-header";
import { Sidebar } from "@/components/shell/sidebar";
import { ToastProvider } from "@/components/shell/toast";

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

  // El turno vive en el shell: abrir/cerrar queda a un click desde cualquier
  // pantalla, y el estado se actualiza con router.refresh().
  const shift = context.can("shift.manage")
    ? await loadOpenShiftSummary(context.branchId, {
        userId: context.user.userId,
        role: context.role,
      })
    : null;

  return (
    <ToastProvider>
      <div className="flex h-screen flex-col">
        <AppHeader context={context} shift={shift} />
        <div className="flex min-h-0 flex-1">
          <Sidebar context={context} />
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-screen flex-col">
      <div className="h-16 shrink-0 border-b border-neutral-800 bg-neutral-900" />
      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 border-r border-neutral-800 bg-neutral-900" />
        <main className="min-w-0 flex-1 p-6">
          <div className="h-32 animate-pulse rounded-xl bg-neutral-900" />
        </main>
      </div>
    </div>
  );
}
