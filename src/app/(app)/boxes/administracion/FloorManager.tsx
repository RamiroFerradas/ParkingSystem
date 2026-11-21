"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FloorCard } from "./floor-card";
import { NewFloorForm } from "./new-floor-form";

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

export function FloorManager({ floors }: { floors: AdminFloor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextSort = floors.length ? Math.max(...floors.map((f) => f.sort_order)) + 10 : 10;

  async function run(url: string, method: "POST" | "PATCH", body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const err = await callApi(url, method, body);
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
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
