"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "inherit" | "allow" | "deny";

interface PermissionRow {
  permission: string;
  label: string;
  group: string;
  roleAllowed: boolean;
  override: boolean | null;
  effective: boolean;
}

const modeOf = (override: boolean | null): Mode =>
  override === null ? "inherit" : override ? "allow" : "deny";

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

/**
 * Editor de accesos por usuario. El rol da el valor heredado; acá el
 * administrador puede habilitar o negar una sección sólo para esta persona.
 * La excepción viaja al menú, a la página y a la API (misma evaluación).
 */
export function PermissionsEditor({
  userId,
  userLabel,
  isSelf,
  onClose,
}: {
  userId: string;
  userLabel: string;
  isSelf: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PermissionRow[] | null>(null);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/users/${userId}/permissions`)
      .then(async (res) => ({ ok: res.ok, status: res.status, data: await res.json().catch(() => null) }))
      .then(({ ok, status, data }) => {
        if (!alive) return;
        if (!ok) {
          setError(data?.error ?? `Error ${status}`);
          return;
        }
        const permissions = (data?.permissions ?? []) as PermissionRow[];
        setRows(permissions);
        setModes(
          Object.fromEntries(permissions.map((p) => [p.permission, modeOf(p.override)])),
        );
        setError(null);
      })
      .catch(() => {
        if (alive) setError("No se pudieron cargar los accesos");
      });
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  async function save() {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const overrides = rows.map((row) => {
        const mode = modes[row.permission] ?? "inherit";
        return {
          permission: row.permission,
          allowed: mode === "inherit" ? null : mode === "allow",
        };
      });
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Error ${res.status}`);
        return;
      }
      setSavedAt(Date.now());
      setReloadKey((n) => n + 1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const groups = new Map<string, PermissionRow[]>();
  for (const row of rows ?? []) {
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">
            Accesos de {userLabel}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Heredado usa el permiso del rol. Permitir o negar aplica sólo a esta
            persona, en el menú, la página y la API.
          </p>
        </div>
        <button className={btnCls} onClick={onClose} disabled={busy}>
          Cerrar
        </button>
      </header>

      {error && (
        <p className="mt-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {!rows && !error && (
        <p className="mt-3 text-xs text-neutral-500">Cargando accesos…</p>
      )}

      {rows && (
        <div className="mt-3 space-y-4">
          {[...groups.entries()].map(([group, items]) => (
            <div key={group}>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {group}
              </p>
              <ul className="mt-1.5 divide-y divide-neutral-800">
                {items.map((row) => {
                  const mode = modes[row.permission] ?? "inherit";
                  const locked = isSelf && row.permission === "user.manage";
                  return (
                    <li
                      key={row.permission}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-neutral-200">{row.label}</p>
                        <p className="text-xs text-neutral-500">
                          Rol: {row.roleAllowed ? "permitido" : "negado"}
                          {mode === "inherit" ? " · heredado" : " · excepción"}
                        </p>
                      </div>
                      <select
                        className={inputCls}
                        value={mode}
                        disabled={busy || locked}
                        title={locked ? "No podés quitarte la administración de usuarios" : undefined}
                        onChange={(e) =>
                          setModes((prev) => ({
                            ...prev,
                            [row.permission]: e.target.value as Mode,
                          }))
                        }
                      >
                        <option value="inherit">Heredado del rol</option>
                        <option value="allow">Permitir</option>
                        <option value="deny">Negar</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button className={btnCls} onClick={save} disabled={busy}>
              Guardar accesos
            </button>
            {savedAt && (
              <span className="text-xs text-emerald-400">Accesos actualizados</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
