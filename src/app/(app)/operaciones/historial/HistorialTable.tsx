"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";
import { printSessionTicket } from "@/lib/print/client";

export interface HistorialRow {
  id: string;
  ticket_number: string;
  plate: string | null;
  vehicle_type_name: string;
  box_number: string;
  entry_at: string;
  exit_at: string | null;
  status: string;
  duration_minutes: number | null;
  final_amount_cents: string | null;
  closed_by_name: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  closed: "Cerrada",
};

const col = createColumnHelper<HistorialRow>();

export function HistorialTable({ rows }: { rows: HistorialRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "entry_at", desc: true }]);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  async function reprint(row: HistorialRow) {
    setPrintingId(row.id);
    setPrintError(null);
    try {
      await printSessionTicket(row.id, "reprint");
    } catch (err) {
      setPrintError(
        err instanceof Error
          ? `No se pudo reimprimir el ticket ${row.ticket_number}: ${err.message}`
          : `No se pudo reimprimir el ticket ${row.ticket_number}`,
      );
    } finally {
      setPrintingId(null);
    }
  }

  const columns = useMemo(
    () => [
      col.accessor("ticket_number", {
        header: "Ticket",
        cell: (info) => (
          <span className="tabular-nums text-neutral-400">#{info.getValue()}</span>
        ),
      }),
      col.accessor("entry_at", {
        header: "Ingreso",
        cell: (info) => (
          <span className="tabular-nums text-neutral-400">
            {formatDate(info.getValue())} {formatTime(info.getValue())}
          </span>
        ),
      }),
      col.accessor("exit_at", {
        header: "Egreso",
        cell: (info) => {
          const value = info.getValue();
          return value ? (
            <span className="tabular-nums text-neutral-400">
              {formatDate(value)} {formatTime(value)}
            </span>
          ) : (
            <span className="text-neutral-600">—</span>
          );
        },
      }),
      col.accessor("plate", {
        header: "Patente",
        cell: (info) => (
          <span className="font-semibold tracking-wide">{info.getValue() ?? "—"}</span>
        ),
      }),
      col.accessor("vehicle_type_name", {
        header: "Tipo",
        cell: (info) => <span className="text-neutral-300">{info.getValue()}</span>,
      }),
      col.accessor("box_number", {
        header: "Box",
        cell: (info) => <span className="text-neutral-300">{info.getValue()}</span>,
      }),
      col.accessor("duration_minutes", {
        header: "Duración",
        cell: (info) => {
          const value = info.getValue();
          return value != null ? (
            <span className="tabular-nums text-neutral-300">{formatElapsed(value)}</span>
          ) : (
            <span className="text-neutral-600">—</span>
          );
        },
      }),
      col.accessor("closed_by_name", {
        header: "Cerró",
        cell: (info) => <span className="text-neutral-300">{info.getValue() ?? "—"}</span>,
      }),
      col.accessor("status", {
        header: "Estado",
        cell: (info) => STATUS_LABEL[info.getValue()] ?? info.getValue(),
      }),
      col.accessor("final_amount_cents", {
        header: "Monto",
        cell: (info) => {
          const value = info.getValue();
          return value != null ? (
            <span className="font-medium tabular-nums text-emerald-400">{formatARS(value)}</span>
          ) : (
            <span className="text-neutral-600">—</span>
          );
        },
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <button
            type="button"
            disabled={printingId === info.row.original.id}
            onClick={() => reprint(info.row.original)}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            {printingId === info.row.original.id ? "..." : "Reimprimir"}
          </button>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
        No hay estadías con esos filtros.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {printError && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          {printError}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="border-b border-neutral-800 bg-neutral-900 text-left text-xs text-neutral-500"
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={
                    "px-4 py-2 font-medium " +
                    (header.column.getCanSort() ? "cursor-pointer select-none" : "")
                  }
                  onClick={header.column.getToggleSortingHandler()}
                  title="Ordenar"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-800 last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
