import { Suspense } from "react";
import { query } from "@/lib/db/client";
import { BranchForm } from "@/components/shell/branch-form";

export default function BranchesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
          Sucursales
        </h1>
        <p className="text-sm text-neutral-500">
          Cada sucursal tiene sus boxes, su caja y su numeración de tickets.
        </p>
      </header>

      <BranchForm />

      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-neutral-900" />}>
        <BranchList />
      </Suspense>
    </div>
  );
}

async function BranchList() {
  const rows = await query<{
    id: string;
    name: string;
    code: string | null;
    is_active: boolean;
    boxes: string;
  }>(
    `SELECT b.id, b.name, b.code, b.is_active,
            (SELECT count(*) FROM parking_boxes pb WHERE pb.branch_id = b.id)::text AS boxes
       FROM branches b
      ORDER BY b.is_active DESC, b.name`,
  );

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Todavía no hay sucursales.</p>;
  }

  return (
    <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-neutral-900">
      {rows.map((branch) => (
        <li key={branch.id} className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-sm text-neutral-100">
              {branch.name}
              {branch.code ? (
                <span className="ml-2 text-xs text-neutral-500">{branch.code}</span>
              ) : null}
            </p>
            <p className="text-xs text-neutral-500">{branch.boxes} boxes</p>
          </div>
          <span
            className={`text-xs ${branch.is_active ? "text-emerald-400" : "text-neutral-500"}`}
          >
            {branch.is_active ? "Activa" : "Inactiva"}
          </span>
        </li>
      ))}
    </ul>
  );
}
