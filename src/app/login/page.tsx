import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            Sistema de Gestión de Estacionamiento
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Ingresá con tu cuenta de empleado
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
