import { Suspense } from "react";
import { QuickActionsSection } from "./_components/dashboard/quick-actions";
import { MiniBoxMapSection } from "./_components/dashboard/mini-box-map-section";
import { OccupancyCardsSection } from "./_components/dashboard/occupancy-cards";
import { ShiftCardSection } from "./_components/dashboard/shift-card";
import { SubscriptionsCardSection } from "./_components/dashboard/subscriptions-card";
import { TodayCardsSection } from "./_components/dashboard/today-cards";
import { YesterdayCardsSection } from "./_components/dashboard/yesterday-cards";
import { MethodsTodaySection } from "./_components/dashboard/methods-today";
import { PendingPrintsSection } from "./_components/dashboard/pending-prints";
import { SkeletonCard } from "./_components/dashboard/skeleton-card";

/**
 * Dashboard con datos reales de la base local. Cada bloque dinámico va en
 * su propio boundary de Suspense (Cache Components).
 *
 * Mobile-first: una columna, dos tarjetas por fila y el estado de la cochera
 * arriba de todo. A partir de `sm` se abren tres columnas y en `lg` dos
 * paneles conviven lado a lado.
 *
 * El guard de sesión y sucursal vive en `layout.tsx` (`ShellGate`): acá solo
 * se compone el orden de las secciones. Cada sección resuelve su permiso y su
 * consulta dentro de su propio boundary, para no bloquear el resto del render.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Dashboard</h1>
          <p className="text-xs text-neutral-500 sm:text-sm">
            Estado del estacionamiento en tiempo real
          </p>
        </div>
        <QuickActionsSection />
      </header>

      <section aria-label="Ocupación de boxes" className="grid grid-cols-2 gap-3 sm:gap-4">
        <Suspense
          fallback={
            <>
              <SkeletonCard className="col-span-2 h-32" />
              <SkeletonCard /><SkeletonCard />
            </>
          }
        >
          <OccupancyCardsSection />
        </Suspense>
      </section>

      <section aria-label="Mapa compacto de boxes" className="grid grid-cols-1 gap-3 sm:gap-4">
        <Suspense fallback={<SkeletonCard />}>
          <MiniBoxMapSection />
        </Suspense>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <Suspense fallback={<SkeletonCard />}>
          <ShiftCardSection />
        </Suspense>
        <Suspense fallback={<SkeletonCard />}>
          <SubscriptionsCardSection />
        </Suspense>
      </section>

      <section
        aria-label="Operación de hoy"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard className="col-span-2 sm:col-span-1" />
            </>
          }
        >
          <TodayCardsSection />
        </Suspense>
      </section>

      <section
        aria-label="Comparativa con ayer"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <Suspense
          fallback={
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard className="col-span-2 sm:col-span-1" />
            </>
          }
        >
          <YesterdayCardsSection />
        </Suspense>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <Suspense fallback={<SkeletonCard />}>
          <MethodsTodaySection />
        </Suspense>
        <Suspense fallback={<SkeletonCard />}>
          <PendingPrintsSection />
        </Suspense>
      </section>
    </div>
  );
}
