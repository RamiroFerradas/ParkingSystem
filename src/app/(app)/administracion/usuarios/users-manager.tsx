"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/components/shell/nav-config";
import { PromptDialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { btnCls, inputCls } from "@/lib/ui-classes";
import { PermissionsEditor } from "./permissions-editor";

export interface ManagedUserBranch {
  id: string;
  name: string;
  role: string;
}

export interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  /** Memberships with their role in each branch. */
  branches?: ManagedUserBranch[];
}

export interface BranchOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS = [
  { value: "employee", label: "Empleado" },
  { value: "supervisor", label: "Supervisor" },
  { value: "admin", label: "Administrador" },
];

export function UsersManager({
  currentUserId,
  currentBranchId = null,
  currentBranchName = null,
  isMaster = false,
  branches = [],
  users,
}: {
  currentUserId: string;
  currentBranchId?: string | null;
  currentBranchName?: string | null;
  isMaster?: boolean;
  branches?: BranchOption[];
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

  // Sucursales del alta: el maestro elige varias; el resto queda fijo a la
  // sucursal activa. El rol de la sucursal actual usa el selector de arriba.
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(() => {
    const next = new Set<string>();
    if (
      isMaster &&
      currentBranchId &&
      branches.some((branch) => branch.id === currentBranchId)
    ) {
      next.add(currentBranchId);
    }
    return next;
  });
  const [branchRoles, setBranchRoles] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const branch of branches) next[branch.id] = "employee";
    return next;
  });

  const activeAdmins = useMemo(
    () => list.filter((u) => u.role === "admin" && u.is_active).length,
    [list],
  );

  const branchRequired = isMaster || currentBranchId !== null;
  const hasBranchSelection = isMaster
    ? selectedBranches.size > 0
    : currentBranchId !== null;

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
    const selected = isMaster
      ? branches.filter((branch) => selectedBranches.has(branch.id))
      : [];
    const memberships = isMaster
      ? selected.map((branch) => ({
          branchId: branch.id,
          role: branchRoles[branch.id] ?? "employee",
        }))
      : currentBranchId
        ? [{ branchId: currentBranchId, role }]
        : undefined;
    // El rol de la sucursal actual (o el primero) viaja también en `role` para
    // los clientes viejos que todavía no mandan `memberships`.
    const currentRole = isMaster
      ? (memberships?.find((m) => m.branchId === currentBranchId)?.role ??
        memberships?.[0]?.role ??
        role)
      : role;

    const created = await call("/api/users", "POST", {
      email,
      fullName: name,
      role: currentRole,
      password,
      ...(memberships ? { memberships } : {}),
    });
    if (!created?.user) return;
    setList((prev) => [...prev, created.user as ManagedUser]);
    setEmail("");
    setName("");
    setPassword("");
    if (isMaster) {
      setSelectedBranches(
        new Set(
          currentBranchId && branches.some((branch) => branch.id === currentBranchId)
            ? [currentBranchId]
            : [],
        ),
      );
      setBranchRoles(
        Object.fromEntries(branches.map((branch) => [branch.id, "employee"])),
      );
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    const r = await call(`/api/users/${id}`, "PATCH", body);
    if (!r) return;
    const nextRole = body.role === undefined ? null : String(body.role);
    setList((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const updated: ManagedUser = {
          ...u,
          is_active:
            body.isActive === undefined ? u.is_active : Boolean(body.isActive),
          role: nextRole ?? u.role,
        };
        if (nextRole && currentBranchId) {
          updated.branches = (u.branches ?? []).map((branch) =>
            branch.id === currentBranchId ? { ...branch, role: nextRole } : branch,
          );
        }
        return updated;
      }),
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

      {error && <Alert>{error}</Alert>}

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
          {!isMaster && (
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          <input
            className={inputCls}
            type="password"
            placeholder="Contraseña (mín. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
          />
        </div>

        {/* Sucursales del alta */}
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Sucursales
          </p>
          {isMaster ? (
            <div className="mt-2 space-y-2">
              {branches.map((branch) => {
                const checked = selectedBranches.has(branch.id);
                return (
                  <div key={branch.id} className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-700 bg-neutral-950"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedBranches((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(branch.id);
                            else next.delete(branch.id);
                            return next;
                          })
                        }
                      />
                      {branch.name}
                      {branch.id === currentBranchId && (
                        <span className="text-xs text-neutral-500">(actual)</span>
                      )}
                    </label>
                    <select
                      className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200 disabled:opacity-40"
                      value={branchRoles[branch.id] ?? "employee"}
                      disabled={!checked}
                      onChange={(e) =>
                        setBranchRoles((prev) => ({
                          ...prev,
                          [branch.id]: e.target.value,
                        }))
                      }
                      aria-label={`Rol en ${branch.name}`}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {branches.length === 0 && (
                <p className="text-xs text-neutral-500">No hay sucursales activas.</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-neutral-300">
              {currentBranchName ?? currentBranchId ?? "Sucursal actual"}
              <span className="ml-2 text-xs text-neutral-500">
                El rol se elige en el formulario.
              </span>
            </p>
          )}
        </div>

        <button
          className={`${btnCls} mt-3 disabled:opacity-40`}
          disabled={
            busy ||
            !email.trim() ||
            !name.trim() ||
            password.length < 8 ||
            (branchRequired && !hasBranchSelection)
          }
          onClick={createUser}
        >
          {busy ? "Creando…" : "Crear usuario"}
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
              // El maestro ve usuarios de otras sucursales: el selector de rol
              // sólo aplica a quienes son miembros de la sucursal activa.
              const inCurrentBranch =
                !currentBranchId ||
                !u.branches ||
                u.branches.some((branch) => branch.id === currentBranchId);
              const roleDisabled = busy || self || lastAdmin || (isMaster && !inCurrentBranch);
              return (
                <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-neutral-200">{u.full_name}</p>
                    <p className="text-xs text-neutral-500">{u.email}</p>
                    {u.branches && u.branches.length > 0 && (
                      <p className="text-xs text-neutral-500">
                        Sucursales:{" "}
                        {u.branches
                          .map(
                            (branch) =>
                              `${branch.name} (${ROLE_LABELS[branch.role] ?? branch.role})`,
                          )
                          .join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200"
                      value={u.role}
                      disabled={roleDisabled}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
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
