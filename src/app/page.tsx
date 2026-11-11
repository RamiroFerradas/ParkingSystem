export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sistema de Gestión de Estacionamiento
        </h1>
        <p className="mt-3 text-sm text-neutral-400">
          Reconstrucción en curso · Next.js 16 · Cache Components
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Dashboard y módulos operativos se integran por etapas (ver
          IMPLEMENTATION_PLAN.md).
        </p>
      </div>
    </main>
  );
}
