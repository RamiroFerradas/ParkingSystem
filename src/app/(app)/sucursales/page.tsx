import { redirect } from "next/navigation";
import { Suspense } from "react";
import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { BranchForm } from "@/components/shell/branch-form";
import { BranchesManager } from "@/components/shell/branches-manager";

export default function BranchesPage() {
  return (
    <Suspense
      fallback={<div className="h-24 animate-pulse rounded-xl bg-neutral-900" />}
    >
      <BranchesGate />
    </Suspense>
  );
}

async function BranchesGate() {
  const context = await getBranchContext();
  if (!context) redirect("/login?expired=1");
  if (!context.isMaster) redirect("/");

  const rows = await query<{
    id: string;
    name: string;
    code: string | null;
    is_active: boolean;
    boxes: number;
  }>(
    `SELECT b.id, b.name, b.code, b.is_active,
            (SELECT count(*)::int FROM parking_boxes pb WHERE pb.branch_id = b.id) AS boxes
       FROM branches b
      ORDER BY b.is_active DESC, b.name`,
  );

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

      <BranchesManager
        branches={rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          isActive: row.is_active,
          boxes: row.boxes,
        }))}
      />
    </div>
  );
}
