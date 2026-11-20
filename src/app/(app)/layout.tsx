import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBranchContext } from "@/lib/auth/context";
import { loadOpenShiftSummary } from "@/lib/queries/shift-summary";
import { NAV_GROUPS, filterNavGroups } from "@/components/shell/nav-config";
import { AppHeader } from "@/components/shell/app-header";
import { Sidebar } from "@/components/shell/sidebar";
import { ToastProvider } from "@/components/shell/toast";
import { MobileNavProvider } from "@/components/shell/mobile-nav";
import { MobileTabBar, type MobileTab } from "@/components/shell/mobile-tab-bar";

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

  const groups = filterNavGroups(NAV_GROUPS, context.can, {
    isMaster: context.isMaster,
  });

  // En el teléfono el menú completo vive en una hoja; abajo quedan solo las
  // pantallas de uso diario. El servidor decide cuáles existen: nunca se
  // muestra una pestaña que termine en "Acceso restringido".
  const tabs: MobileTab[] = [
    { href: "/", label: "Inicio", icon: "home" },
    ...(context.can("box.read")
      ? [{ href: "/boxes/mapa", label: "Mapa", icon: "map" as const }]
      : []),
    ...(context.can("session.open")
      ? [{ href: "/operaciones/ingreso", label: "Ingreso", icon: "in" as const }]
      : []),
    ...(context.can("session.close")
      ? [{ href: "/operaciones/egreso", label: "Egreso", icon: "out" as const }]
      : []),
  ];

  return (
    <ToastProvider>
      <MobileNavProvider groups={groups}>
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[90] focus:rounded-md focus:bg-neutral-100 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-neutral-900"
        >
          Saltar al contenido
        </a>
        <div className="flex h-dvh flex-col overflow-hidden">
          <AppHeader context={context} shift={shift} />
          <div className="flex min-h-0 flex-1">
            <Sidebar groups={groups} />
            <main
              id="contenido"
              className="min-w-0 flex-1 overflow-y-auto px-3 pb-28 pt-4 sm:px-4 lg:px-6 lg:pb-8 lg:pt-6"
            >
              {children}
            </main>
          </div>
          <MobileTabBar tabs={tabs} />
        </div>
      </MobileNavProvider>
    </ToastProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="h-24 shrink-0 border-b border-neutral-800 bg-neutral-900 lg:h-16" />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-60 shrink-0 border-r border-neutral-800 bg-neutral-900 lg:block" />
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
          <div className="h-32 animate-pulse rounded-xl bg-neutral-900" />
        </main>
      </div>
    </div>
  );
}
