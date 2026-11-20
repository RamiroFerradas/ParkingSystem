import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8">
        <div className="text-center">
          {/* La marca como patente: banda azul, chapa blanca, tinta negra */}
          <div className="mx-auto w-fit overflow-hidden rounded-md bg-plate shadow-[0_1px_0_rgba(0,0,0,0.55)]">
            <div className="h-2 bg-plate-blue" />
            <p className="px-3 py-1.5 text-[12px] font-extrabold uppercase leading-none tracking-[0.18em] text-plate-ink">
              Mauricio&apos;s Parking
            </p>
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">
            Sistema de Gestión de Estacionamiento
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Ingresá con tu cuenta
          </p>
        </div>
        <Suspense fallback={null}>
          <ExpiredNotice searchParams={searchParams} />
        </Suspense>
        <LoginForm />
      </div>
    </main>
  );
}

/** Aviso para sesiones que el servidor ya invalidó (cookie vieja o usuario inactivo). */
async function ExpiredNotice({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  if (!expired) return null;
  return (
    <p
      className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400"
      data-session-expired
    >
      Tu sesión venció. Volvé a ingresar.
    </p>
  );
}
