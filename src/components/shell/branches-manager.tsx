"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/dialog";

export interface BranchRow {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  boxes: number;
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function BranchesManager({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<BranchRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEdit(branch: BranchRow) {
    setEditing(branch.id);
    setName(branch.name);
    setCode(branch.code ?? "");
    setError(null);
  }

  async function patch(branchId: string, payload: Record<string, unknown>) {
    setBusy(branchId);
    setError(null);
    try {
      const response = await fetch(`/api/branches/${branchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "No se pudo guardar");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("No se pudo guardar");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(deleting.id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/branches/${deleting.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setDeleteError(data.error ?? "No se pudo eliminar la sucursal");
        return;
      }
      setDeleting(null);
      router.refresh();
    } catch {
      setDeleteError("No se pudo eliminar la sucursal");
    } finally {
      setBusy(null);
    }
  }

  if (branches.length === 0) {
    return <p className="text-sm text-neutral-500">Todavía no hay sucursales.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-neutral-900">
        {branches.map((branch) => (
          <li key={branch.id} className="px-5 py-3">
            {editing === branch.id ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await patch(branch.id, { name, code });
                  if (ok) setEditing(null);
                }}
                className="flex flex-wrap items-end gap-2"
              >
                <label className="min-w-40 flex-1 text-xs">
                  <span className="mb-1 block text-neutral-500">Nombre</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100"
                  />
                </label>
                <label className="w-28 text-xs">
                  <span className="mb-1 block text-neutral-500">Código</span>
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy === branch.id}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {busy === branch.id ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-100">
                    {branch.name}
                    {branch.code ? (
                      <span className="ml-2 text-xs text-neutral-500">{branch.code}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {branch.boxes} boxes ·{" "}
                    <span className={branch.isActive ? "text-emerald-400" : "text-neutral-500"}>
                      {branch.isActive ? "Activa" : "Inactiva"}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(branch)}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(branch.id, { isActive: !branch.isActive })}
                    disabled={busy === branch.id}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-60"
                  >
                    {branch.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleting(branch);
                    }}
                    disabled={busy === branch.id}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:border-red-400 disabled:opacity-60"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          if (busy === null) setDeleting(null);
        }}
        onConfirm={confirmDelete}
        busy={busy !== null}
        title={`Eliminar ${deleting?.name ?? "sucursal"}`}
        confirmLabel="Eliminar sucursal"
        icon={<TrashIcon />}
        description={
          <>
            La sucursal <strong className="font-semibold text-neutral-100">
              {deleting?.name}
            </strong>{" "}
            se va a borrar definitivamente. Solo es posible si no tiene boxes,
            estadías, turnos, tarifas ni usuarios asignados. Si tiene datos,
            desactivala en vez de eliminarla.
          </>
        }
        error={deleteError}
      />
    </div>
  );
}
