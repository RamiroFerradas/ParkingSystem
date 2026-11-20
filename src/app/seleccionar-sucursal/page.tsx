import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBranchContext } from "@/lib/auth/context";
import { BranchPicker } from "@/components/shell/branch-picker";

export default function SelectBranchPage() {
  return (
    <Suspense fallback={<PickerSkeleton />}>
      <PickerGate />
    </Suspense>
  );
}

async function PickerGate() {
  const context = await getBranchContext();
  if (!context) redirect("/login?expired=1");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <header className="mb-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-neutral-500">
          Mauricio&apos;s Parking
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-100">
          Elegí una sucursal
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Hola {context.user.name}. Todo lo que hagas a partir de acá queda en la
          sucursal que elijas.
        </p>
      </header>
      <BranchPicker options={context.memberships} />
    </main>
  );
}

function PickerSkeleton() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <div className="h-32 animate-pulse rounded-xl bg-neutral-900" />
    </main>
  );
}
