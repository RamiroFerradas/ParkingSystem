"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/components/shell/nav-config";
import { PromptDialog } from "@/components/ui/dialog";
import { PermissionsEditor } from "./permissions-editor";

export interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

export function UsersManager({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: ManagedUser[];
}) {
  const router = useRouter();
  const [list, setList] = useState(users);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<ManagedUser | null>(null);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Alta de usuario
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("employee");
  const [password, setPassword] = useState("");

  const activeAdmins = useMemo(
    () => list.filter((u) => u.role === "admin" && u.is_active).length,
    [list],
  );

  async function call(url: string, method: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Error ${res.status}`);
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function createUser() {
    const created = await call("/api/users", "POST", {
      email,
      fullName: name,
      role,
      password,
    });
    if (!created?.user) return;
    setList((prev) => [...prev, created.user]);
    setEmail("");
    setName("");
    setPassword("");
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    const r = await call(`/api/users/${id}`, "PATCH", body);
    if (!r) return;
    setList((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, is_active: body.isActive === undefined ? u.is_active : Boolean(body.isActive), role: body.role === undefined ? u.role : String(body.role) }
          : u,
      ),
    );
    router.refresh();
  }

  async function applyPassword(value: string) {
    if (!passwordFor) return;
    if (value.length < 8) {
      setPasswordError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setBusy(true);
    setPasswordError(null);
    try {
      const res = await fetch(`/api/users/${passwordFor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPasswordError(data?.error ?? "No se pudo cambiar la contraseña");
        return;
      }
      setPasswordFor(null);
    } catch {
      setPasswordError("No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Usuarios</h1>
        <p className="text-sm text-neutral-500">
          Alta de empleados y roles. Un usuario desactivado no puede iniciar
          sesión; siempre queda un administrador activo.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Alta */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Nuevo usuario</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className={inputCls}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Nombre y apellido"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="employee">Empleado</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Administrador</option>
          </select>
          <input
            className={inputCls}
            type="password"
            placeholder="Contraseña (mín. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
          />
        </div>
        <button
          className={`${btnCls} mt-2 disabled:opacity-40`}
          disabled={busy || !email.trim() || !name.trim() || password.length < 8}
          onClick={createUser}
        >
          Crear usuario
        </button>
      </section>

      {/* Listado */}
      <section className="scroll-x rounded-xl border border-neutral-800">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Usuario</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {list.map((u) => {
              const self = u.id === currentUserId;
              const lastAdmin = u.role === "admin" && u.is_active && activeAdmins === 1;
              return (
                <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-neutral-200">{u.full_name}</p>
                    <p className="text-xs text-neutral-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200"
                      value={u.role}
                      disabled={busy || self || lastAdmin}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    >
                      <option value="employee">Empleado</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.is_active ? (
                      <span className="text-xs text-emerald-400">Activo</span>
                    ) : (
                      <span className="text-xs text-neutral-500">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="flex justify-end gap-1.5">
                      <button
                        className={btnCls}
                        disabled={busy}
                        onClick={() => setPermissionsFor(u)}
                        title="Habilitar u ocultar secciones del sidebar"
                      >
                        Accesos
                      </button>
                      <button
                        className={btnCls}
                        disabled={busy}
                        onClick={() => {
                          setPasswordError(null);
                          setPasswordFor(u);
                        }}
                        title="Cambiar contraseña"
                      >
                        Contraseña
                      </button>
                      <button
                        className={btnCls}
                        disabled={busy || self || lastAdmin}
                        onClick={() => patchUser(u.id, { isActive: !u.is_active })}
                      >
                        {u.is_active ? "Desactivar" : "Reactivar"}
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {permissionsFor && (
        <PermissionsEditor
          key={permissionsFor.id}
          userId={permissionsFor.id}
          userLabel={permissionsFor.full_name}
          isSelf={permissionsFor.id === currentUserId}
          onClose={() => setPermissionsFor(null)}
        />
      )}

      <PromptDialog
        key={passwordFor?.id ?? "closed"}
        open={passwordFor !== null}
        onClose={() => {
          if (!busy) setPasswordFor(null);
        }}
        onSubmit={applyPassword}
        title="Cambiar contraseña"
        description={
          <>
            Nueva contraseña para{" "}
            <strong className="font-medium text-neutral-200">
              {passwordFor?.full_name}
            </strong>{" "}
            ({passwordFor?.email}). La anterior deja de funcionar al guardar.
          </>
        }
        label="Contraseña nueva"
        type="password"
        minLength={8}
        hint="Mínimo 8 caracteres."
        confirmLabel="Cambiar contraseña"
        busy={busy}
        error={passwordError}
      />

      <p className="text-xs text-neutral-600">
        {ROLE_LABELS.admin}: acceso total. Supervisor: operación + reportes.
        Empleado: operación diaria.
      </p>
    </div>
  );
}
