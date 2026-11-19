"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface AdminBox {
  id: string;
  number: string;
  sector: string | null;
  is_active: boolean;
  is_service_enabled: boolean;
  status: string | null;
  plate: string | null;
}

export interface AdminFloor {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  boxes: AdminBox[];
}

type ApiResult = { ok?: boolean; error?: string };

async function callApi(url: string, method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as ApiResult;
    if (!res.ok) return data.error ?? "Error inesperado";
    return null;
  } catch {
    return "Error de red";
  }
}

const inputCls =
  "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";
const btnCls =
  "rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";
const btnDangerCls =
  "rounded-md border border-red-900 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-950 disabled:opacity-40";

const STATUS_DOT: Record<string, string> = {
  available: "bg-emerald-500",
  occupied: "bg-amber-500",
  out_of_service: "bg-red-500",
};

export function FloorManager({ floors }: { floors: AdminFloor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextSort = floors.length ? Math.max(...floors.map((f) => f.sort_order)) + 10 : 10;

  async function run(url: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError(null);
    const err = await callApi(url, method, body);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <NewFloorForm disabled={busy || pending} onSubmit={run} nextSort={nextSort} />

      {floors.map((floor, idx) => (
        <FloorCard
          key={floor.id}
          floor={floor}
          canMoveUp={idx > 0}
          canMoveDown={idx < floors.length - 1}
          disabled={busy || pending}
          onAction={run}
        />
      ))}
    </div>
  );
}

/** Alta de piso con generación masiva de boxes: nombre + cantidad + prefijo. */
function NewFloorForm({
  disabled,
  onSubmit,
  nextSort,
}: {
  disabled: boolean;
  onSubmit: (url: string, method: "POST" | "PATCH", body: unknown) => Promise<void>;
  nextSort: number;
}) {
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  const prefix = suggestPrefix(name);

  return (
    <form
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const boxCount = parseInt(count, 10);
        await onSubmit("/api/floors", "POST", {
          name,
          boxCount: Number.isNaN(boxCount) ? 0 : boxCount,
          prefix,
          sortOrder: nextSort,
        });
        setName("");
        setCount("");
      }}
    >
      <p className="text-sm font-medium text-neutral-200">Agregar piso</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={inputCls + " w-48"}
          placeholder="Nombre del piso (ej. Planta baja)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          required
        />
        <input
          className={inputCls + " w-40"}
          type="number"
          min={0}
          max={120}
          placeholder="Cantidad de boxes"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          required
        />
        <span className="text-xs text-neutral-500">
          Se crean <span className="font-mono text-neutral-300">{prefix || "PREFIX"}-01</span>,{" "}
          <span className="font-mono text-neutral-300">{prefix || "PREFIX"}-02</span>…
        </span>
        <button type="submit" className={btnCls} disabled={disabled || !name.trim()}>
          Crear piso
        </button>
      </div>
    </form>
  );
}

function suggestPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.map((w) => w[0]!.toUpperCase()).join("");
  return /^[A-Z0-9]+$/.test(letters) && letters.length <= 8 ? letters : "";
}

function FloorCard({
  floor,
  canMoveUp,
  canMoveDown,
  disabled,
  onAction,
}: {
  floor: AdminFloor;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  onAction: (url: string, method: "POST" | "PATCH", body: unknown) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(floor.name);
  const [addingBox, setAddingBox] = useState(false);
  const [boxNumber, setBoxNumber] = useState("");
  const [boxSector, setBoxSector] = useState("");

  return (
    <section
      className={`rounded-xl border p-4 ${
        floor.is_active ? "border-neutral-800 bg-neutral-900" : "border-neutral-800/60 bg-neutral-900/50 opacity-70"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <>
            <input
              className={inputCls + " w-52"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <button
              className={btnCls}
              disabled={disabled || !newName.trim()}
              onClick={async () => {
                await onAction("/api/floors", "PATCH", { id: floor.id, name: newName.trim() });
                setRenaming(false);
              }}
            >
              Guardar
            </button>
            <button className={btnCls} onClick={() => setRenaming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-neutral-100">{floor.name}</h2>
            <span className="text-xs text-neutral-600">{floor.boxes.length} boxes</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                className={btnCls}
                disabled={disabled || !canMoveUp}
                onClick={() =>
                  onAction("/api/floors", "PATCH", {
                    id: floor.id,
                    sortOrder: floor.sort_order - 1,
                  })
                }
                title="Mover arriba"
              >
                ↑
              </button>
              <button
                className={btnCls}
                disabled={disabled || !canMoveDown}
                onClick={() =>
                  onAction("/api/floors", "PATCH", {
                    id: floor.id,
                    sortOrder: floor.sort_order + 1,
                  })
                }
                title="Mover abajo"
              >
                ↓
              </button>
              <button className={btnCls} disabled={disabled} onClick={() => setRenaming(true)}>
                Renombrar
              </button>
              <button
                className={btnCls}
                disabled={disabled}
                onClick={() => setAddingBox((v) => !v)}
              >
                + Box
              </button>
              <button
                className={floor.is_active ? btnDangerCls : btnCls}
                disabled={disabled}
                onClick={() =>
                  onAction("/api/floors", "PATCH", {
                    id: floor.id,
                    isActive: !floor.is_active,
                  })
                }
              >
                {floor.is_active ? "Desactivar piso" : "Reactivar piso"}
              </button>
            </div>
          </>
        )}
      </header>

      {addingBox && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await onAction("/api/boxes", "POST", {
              floorId: floor.id,
              number: boxNumber,
              sector: boxSector,
            });
            setBoxNumber("");
            setBoxSector("");
            setAddingBox(false);
          }}
        >
          <input
            className={inputCls + " w-36"}
            placeholder="Número (ej. PB-31)"
            value={boxNumber}
            onChange={(e) => setBoxNumber(e.target.value)}
            maxLength={12}
            required
            autoFocus
          />
          <input
            className={inputCls + " w-36"}
            placeholder="Sector (opcional)"
            value={boxSector}
            onChange={(e) => setBoxSector(e.target.value)}
            maxLength={30}
          />
          <button type="submit" className={btnCls} disabled={disabled || !boxNumber.trim()}>
            Agregar
          </button>
          <button type="button" className={btnCls} onClick={() => setAddingBox(false)}>
            Cancelar
          </button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {floor.boxes.map((box) => (
          <BoxChip key={box.id} box={box} />
        ))}
      </div>
    </section>
  );
}

/** Cada box es solo lectura acá: se edita desde el mapa, con este link directo. */
function BoxChip({ box }: { box: AdminBox }) {
  return (
    <a
      href={`/boxes/mapa?box=${box.id}`}
      data-box-map-link
      title="Editar en el mapa"
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition hover:border-neutral-500 ${
        box.is_active
          ? box.status === "occupied"
            ? "border-amber-900 bg-amber-950/50 text-amber-200"
            : "border-neutral-800 bg-neutral-950 text-neutral-200"
          : "border-dashed border-neutral-800 text-neutral-600"
      }`}
    >
      <span className={`size-2 rounded-full ${STATUS_DOT[box.status ?? ""] ?? "bg-neutral-600"}`} />
      <span className="font-mono font-semibold">{box.number}</span>
      {box.sector && <span className="text-neutral-500">· {box.sector}</span>}
      {box.status === "occupied" && box.plate && (
        <span className="font-medium">{box.plate}</span>
      )}
      {!box.is_active && <span className="text-[10px] uppercase tracking-wider">baja</span>}
    </a>
  );
}
